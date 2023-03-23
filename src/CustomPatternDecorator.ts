'use strict';

import * as vscode from 'vscode';
import CustomPattern = require('./CustomPattern');

class Pattern {
    pattern: string;
    foreground?: string;
    background?: string;
    fontWeight?: string;
    fontStyle?: string;
    border?: string;
    borderRadius?: string;
    borderSpacing?: string;
    letterSpacing?: string;
    overviewColor?: string;
    overviewRulerLane?: string;
    textDecoration?: string;

    public constructor(pattern: string, foreground: string) {
        this.pattern = pattern;
        this.foreground = foreground;
    }
}

class CustomPatternDecorator {

    // All custom log level specified in the configuration.
    private _configPattern: CustomPattern[];

    // Indicates in which file which log level highlights which ranges.
    private _cache: Map<vscode.Uri, Map<CustomPattern, vscode.Range[]>>;

    public constructor() {
        this._configPattern = [];
        this._cache = new Map<vscode.Uri, Map<CustomPattern, vscode.Range[]>>();
    }

    public updateConfiguration(): void {
        const configPatterns = []; //vscode.workspace.getConfiguration('logFileHighlighter').get('customPatterns') as Pattern[];

        //configPatterns.push([pattern: 'sofia\/external', foreground: '#FF0000', null, null, null, null, null, null, null, null, null, null] as Pattern);

        // gateways
        configPatterns.push(new Pattern('sofia\\/[a-zA-Z]+\\/((\\+)?[0-9]+(@[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+(:[0-9]+)?)?)?', '#AFFFAF'));
        // log levels
        configPatterns.push(new Pattern('\\[DEBUG\\]', '#FFFF00'));
        configPatterns.push(new Pattern('\\[INFO\\]', '#00FF00'));
        configPatterns.push(new Pattern('\\[NOTICE\\]', '#00FFFF'));
        configPatterns.push(new Pattern('\\[WARNING\\]', '#808000'));
        configPatterns.push(new Pattern('\\[ERROR|CRITICAL\\]', '#FF0000'));
        // guuid
        configPatterns.push(new Pattern('[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}', '#949494'));
        // percent load
        configPatterns.push(new Pattern('[0-9]+\\.[0-9]+%', '#E0E0E0'));
        // time
        configPatterns.push(new Pattern('[0-9]{4}-[0-9]{2}-[0-9]{2}\\s[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]+', '#5fd7af'));
        // (phone) numbers
        configPatterns.push(new Pattern('(\\+)?[0-9]{6,}', '#6789ab'));
        // c(pp) files
        configPatterns.push(new Pattern('[a-z_]+\\.c(pp)?:[0-9]+', '#d7afd7'));

        for (const pattern of this._configPattern) {
            pattern.dispose();
        }

        this._configPattern = [];

        for (const item of configPatterns) {
            // If we have a pattern and either a foreground or background color, then use the pattern
            if (
                (item.foreground !== undefined
                    || item.background !== undefined
                    || item.fontWeight !== undefined
                    || item.fontStyle !== undefined
                    || item.border !== undefined
                    || item.borderRadius !== undefined
                )
                && item.pattern !== undefined) {
                var pattern = new CustomPattern(
                    item.pattern, item.foreground, item.background,
                    item.fontWeight, item.fontStyle, item.border, item.borderRadius,
                    item.borderSpacing, item.letterSpacing,
                    item.overviewColor, vscode.OverviewRulerLane[item.overviewRulerLane],
                    item.textDecoration);
                this._configPattern.push(pattern);
            }
        }
    }

    public decorateDocument(changedEvent: vscode.TextDocumentChangeEvent): void {
        if (this._configPattern.length === 0 || changedEvent.contentChanges.length === 0) {
            return;
        }

        const doc = changedEvent.document;

        const editors = vscode.window.visibleTextEditors.filter((editor) => {
            return editor.document.fileName === doc.fileName;
        });

        const change = changedEvent.contentChanges.slice().sort((a, b) => Math.abs(a.range.start.line - b.range.start.line))[0];

        // Start always at the beginning of the line.
        const startPos = new vscode.Position(change.range.start.line, 0);
        const docCache = this._cache.get(doc.uri);

        const contentToEnd: string =
            doc.getText(new vscode.Range(startPos, doc.lineAt(doc.lineCount - 1).range.end));

        for (const logLevel of this._configPattern) {
            const patternCache = docCache.get(logLevel);

            // Remove all ranges from the cache that occur after the changed range (change.range).
            const logLevelRanges = patternCache.filter((range) => {
                return range.end.isBefore(change.range.start);
            });

            for (const regex of logLevel.regexes) {
                let matches = regex.exec(contentToEnd);

                while (matches) {
                    const start = doc.positionAt(doc.offsetAt(startPos) + matches.index);
                    const end = start.translate(0, matches[0].length);
                    logLevelRanges.push(new vscode.Range(start, end));

                    matches = regex.exec(contentToEnd);
                }
            }

            // Update cache and set decorations.
            docCache.set(logLevel, logLevelRanges);
            editors[0].setDecorations(logLevel.decoration, logLevelRanges);
        }

        this._cache.set(doc.uri, docCache);
    }

    public decorateEditors(editors: vscode.TextEditor[], changes?: vscode.TextDocumentContentChangeEvent[]): void {
        if (editors.length >= 1) {
            for (const editor of editors) {
                const content = editor.document.getText();

                const docRanges = new Map<CustomPattern, vscode.Range[]>();
                for (const logLevel of this._configPattern) {
                    const logLevelRanges = [];

                    for (const regex of logLevel.regexes) {
                        let matches = regex.exec(content);

                        while (matches) {
                            const start = editor.document.positionAt(matches.index);
                            const end = start.translate(0, matches[0].length);

                            logLevelRanges.push(new vscode.Range(start, end));

                            matches = regex.exec(content);
                        }
                    }

                    // Update cache and set decorations.
                    editor.setDecorations(logLevel.decoration, logLevelRanges);
                    docRanges.set(logLevel, logLevelRanges);
                }

                this._cache.set(editor.document.uri, docRanges);
            }
        }
    }

    public dispose() {
        for (const level of this._configPattern) {
            level.dispose();
        }

        this._cache.forEach((patternCache) => {
            for (const pattern of patternCache.keys()) {
                pattern.dispose();
            }
        });
    }
}

export = CustomPatternDecorator;
