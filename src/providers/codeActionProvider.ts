import * as vscode from 'vscode';
import { ISSUES } from '../analyzers/issues';

/**
 * Provides the lightbulb fixes that appear next to every SEO/AdSense diagnostic.
 */
export class SeoCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== 'SEO/AdSense') continue;

            const aiFix = new vscode.CodeAction(
                `✨ Fix "${diagnostic.code}" with AI`,
                vscode.CodeActionKind.QuickFix
            );
            aiFix.command = {
                command: 'seoAdsense.fixWithAI',
                title: 'Fix with AI',
                arguments: [document, diagnostic.range, diagnostic]
            };
            aiFix.diagnostics = [diagnostic];
            aiFix.isPreferred = true;
            actions.push(aiFix);

            const deterministic = buildDeterministicFix(document, diagnostic);
            if (deterministic) {
                actions.push(deterministic);
            }
        }

        return actions;
    }
}

function buildDeterministicFix(document: vscode.TextDocument, diagnostic: vscode.Diagnostic): vscode.CodeAction | null {
    const code = String(diagnostic.code ?? '');
    const source = document.getText();

    switch (code) {
        case ISSUES.MISSING_VIEWPORT.id:
            return insertInHead(
                document,
                source,
                '<meta name="viewport" content="width=device-width, initial-scale=1">',
                'Insert viewport meta tag'
            );
        case ISSUES.MISSING_CHARSET.id:
            return insertInHead(
                document,
                source,
                '<meta charset="UTF-8">',
                'Insert charset meta tag',
                true
            );
        case ISSUES.MISSING_CANONICAL.id:
            return insertInHead(
                document,
                source,
                '<link rel="canonical" href="https://example.com/replace-me">',
                'Insert canonical link (placeholder)'
            );
        case ISSUES.IMG_MISSING_ALT.id:
            return addAttributeToImg(document, diagnostic.range, 'alt', '', 'Add empty alt attribute');
        case ISSUES.IMG_NO_LAZY_LOAD.id:
            return addAttributeToImg(document, diagnostic.range, 'loading', 'lazy', 'Add loading="lazy"');
        case ISSUES.RENDER_BLOCKING_SCRIPT.id:
            return addAttributeToTag(document, diagnostic.range, 'defer', null, 'Add defer attribute');
        default:
            return null;
    }
}

function insertInHead(
    document: vscode.TextDocument,
    source: string,
    snippet: string,
    title: string,
    asFirstChild = false
): vscode.CodeAction | null {
    const headOpen = source.match(/<head\b[^>]*>/i);
    if (!headOpen) return null;
    const insertAt = source.indexOf(headOpen[0]) + headOpen[0].length;

    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    const edit = new vscode.WorkspaceEdit();
    const pos = document.positionAt(insertAt);
    const prefix = asFirstChild ? '\n  ' : '\n  ';
    edit.insert(document.uri, pos, prefix + snippet);
    action.edit = edit;
    return action;
}

function addAttributeToImg(
    document: vscode.TextDocument,
    range: vscode.Range,
    attr: string,
    value: string | null,
    title: string
): vscode.CodeAction | null {
    const tag = document.getText(range);
    if (!/<img\b/i.test(tag)) return null;
    if (new RegExp(`\\b${attr}\\b`, 'i').test(tag)) return null;

    let newTag: string;
    if (value === null) {
        newTag = tag.replace(/<img\b/i, `<img ${attr}`);
    } else {
        newTag = tag.replace(/<img\b/i, `<img ${attr}="${value}"`);
    }

    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, newTag);
    action.edit = edit;
    return action;
}

function addAttributeToTag(
    document: vscode.TextDocument,
    range: vscode.Range,
    attr: string,
    value: string | null,
    title: string
): vscode.CodeAction | null {
    const tag = document.getText(range);
    const match = tag.match(/^(<[a-zA-Z][a-zA-Z0-9]*)/);
    if (!match) return null;
    if (new RegExp(`\\b${attr}\\b`, 'i').test(tag)) return null;

    let newTag: string;
    if (value === null) {
        newTag = tag.replace(match[1], `${match[1]} ${attr}`);
    } else {
        newTag = tag.replace(match[1], `${match[1]} ${attr}="${value}"`);
    }

    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, newTag);
    action.edit = edit;
    return action;
}
