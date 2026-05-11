import * as vscode from 'vscode';
import { analyzeDocument, SUPPORTED_LANGUAGES } from './analyzers';
import { SeoCodeActionProvider } from './providers/codeActionProvider';
import { openAdSenseReviewPanel } from './views/adsenseReviewPanel';
import { fixWithAI, fixAllInDocument } from './llm/aiFixer';
import { computeSeoScore, scoreWordCount } from './analyzers/score';
import { detectAiWritten, AiWrittenResult } from './llm/aiWrittenDetector';

let diagnosticCollection: vscode.DiagnosticCollection;
let scanDebounceTimer: NodeJS.Timeout | undefined;

interface AiWrittenCacheEntry {
    version: number;
    result: AiWrittenResult;
}
const aiWrittenCache = new Map<string, AiWrittenCacheEntry>();

let issuesStatusItem: vscode.StatusBarItem;
let seoScoreItem: vscode.StatusBarItem;
let aiWrittenItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
    console.log('[SEO/AdSense] Extension activated');

    diagnosticCollection = vscode.languages.createDiagnosticCollection('seoAdsense');
    context.subscriptions.push(diagnosticCollection);

    seoScoreItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
    seoScoreItem.command = 'seoAdsense.showReport';
    context.subscriptions.push(seoScoreItem);

    aiWrittenItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
    aiWrittenItem.command = 'seoAdsense.detectAiWritten';
    context.subscriptions.push(aiWrittenItem);

    issuesStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    issuesStatusItem.command = 'seoAdsense.showReport';
    context.subscriptions.push(issuesStatusItem);

    for (const lang of SUPPORTED_LANGUAGES) {
        context.subscriptions.push(
            vscode.languages.registerCodeActionsProvider(
                { language: lang },
                new SeoCodeActionProvider(),
                { providedCodeActionKinds: SeoCodeActionProvider.providedCodeActionKinds }
            )
        );
    }

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => scanDocument(doc)),
        vscode.workspace.onDidSaveTextDocument(doc => scanDocument(doc)),
        vscode.workspace.onDidCloseTextDocument(doc => {
            diagnosticCollection.delete(doc.uri);
            aiWrittenCache.delete(doc.uri.toString());
        }),
        vscode.workspace.onDidChangeTextDocument(e => {
            const config = vscode.workspace.getConfiguration('seoAdsense');
            if (!config.get<boolean>('enableAutoScan', true)) return;
            if (scanDebounceTimer) clearTimeout(scanDebounceTimer);
            scanDebounceTimer = setTimeout(() => scanDocument(e.document), 600);
        }),
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) updateStatusBar(editor.document);
            else hideStatusBar();
        })
    );

    vscode.workspace.textDocuments.forEach(doc => scanDocument(doc));
    if (vscode.window.activeTextEditor) {
        updateStatusBar(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('seoAdsense.scanFile', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Open a file to scan.');
                return;
            }
            scanDocument(editor.document);
            const count = (diagnosticCollection.get(editor.document.uri) || []).length;
            vscode.window.showInformationMessage(
                `SEO/AdSense scan complete: ${count} issue${count === 1 ? '' : 's'} found.`
            );
        }),

        vscode.commands.registerCommand('seoAdsense.scanWorkspace', () => scanWorkspace()),

        vscode.commands.registerCommand('seoAdsense.simulateAdSenseReview', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Open an HTML, PHP, or Markdown file to run the review.');
                return;
            }
            openAdSenseReviewPanel(context, editor.document);
        }),

        vscode.commands.registerCommand('seoAdsense.fixWithAI', (document: vscode.TextDocument, range: vscode.Range, diagnostic: vscode.Diagnostic) => {
            return fixWithAI(document, range, diagnostic);
        }),

        vscode.commands.registerCommand('seoAdsense.fixAllWithAI', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;
            const diags = diagnosticCollection.get(editor.document.uri) || [];
            if (diags.length === 0) {
                vscode.window.showInformationMessage('No issues to fix.');
                return;
            }
            const confirm = await vscode.window.showWarningMessage(
                `Fix ${diags.length} issue(s) with AI? Each will be reviewed before applying.`,
                'Fix All',
                'Cancel'
            );
            if (confirm === 'Fix All') {
                await fixAllInDocument(editor.document, diags);
            }
        }),

        vscode.commands.registerCommand('seoAdsense.showReport', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) openAdSenseReviewPanel(context, editor.document);
        }),

        vscode.commands.registerCommand('seoAdsense.detectAiWritten', () => runAiWrittenDetection())
    );
}

function scanDocument(document: vscode.TextDocument): void {
    if (!SUPPORTED_LANGUAGES.includes(document.languageId)) {
        diagnosticCollection.delete(document.uri);
        if (vscode.window.activeTextEditor?.document === document) hideStatusBar();
        return;
    }

    const issues = analyzeDocument(document);
    const diagnostics = issues.map(issue => {
        const diag = new vscode.Diagnostic(issue.range, issue.message, issue.severity);
        diag.source = 'SEO/AdSense';
        diag.code = issue.code;
        return diag;
    });
    diagnosticCollection.set(document.uri, diagnostics);

    const cached = aiWrittenCache.get(document.uri.toString());
    if (cached && cached.version !== document.version) {
        aiWrittenCache.delete(document.uri.toString());
    }

    if (vscode.window.activeTextEditor?.document === document) {
        updateStatusBar(document);
    }
}

function updateStatusBar(document: vscode.TextDocument): void {
    if (!SUPPORTED_LANGUAGES.includes(document.languageId)) {
        hideStatusBar();
        return;
    }

    const diags = diagnosticCollection.get(document.uri) || [];
    const issuesForScoring = diags.map(d => ({ severity: d.severity })) as any;

    const words = scoreWordCount(document, document.getText());
    const { score, errors, warnings } = computeSeoScore(issuesForScoring, words);

    const scoreIcon =
        score >= 85 ? '$(pass-filled)' :
        score >= 65 ? '$(warning)' :
        '$(error)';
    seoScoreItem.text = `${scoreIcon} SEO ${score}`;
    seoScoreItem.tooltip = new vscode.MarkdownString(
        `**SEO Score: ${score}/100**\n\n` +
        `- Errors: ${errors}\n` +
        `- Warnings: ${warnings}\n` +
        `- Words: ${words}\n\n` +
        `_Click to open the full SEO/AdSense report._`
    );
    seoScoreItem.show();

    if (diags.length === 0) {
        issuesStatusItem.text = '$(check) 0 issues';
        issuesStatusItem.tooltip = 'No SEO/AdSense issues detected.';
    } else {
        issuesStatusItem.text = `${errors}✗ ${warnings}⚠`;
        issuesStatusItem.tooltip = `${diags.length} SEO/AdSense issue(s). Click for full report.`;
    }
    issuesStatusItem.show();

    const cacheKey = document.uri.toString();
    const cached = aiWrittenCache.get(cacheKey);
    if (cached && cached.version === document.version) {
        const ai = cached.result;
        const icon =
            ai.score >= 70 ? '$(sparkle)' :
            ai.score >= 40 ? '$(robot)' :
            '$(person)';
        aiWrittenItem.text = `${icon} AI ${ai.score}%`;
        aiWrittenItem.tooltip = new vscode.MarkdownString(
            `**AI-written likelihood: ${ai.score}%**\n\n${ai.reason || ''}\n\n_Click to re-run detection._`
        );
    } else {
        aiWrittenItem.text = '$(sparkle) AI —';
        aiWrittenItem.tooltip = 'Click to estimate AI-written likelihood (requires GitHub Copilot Chat).';
    }
    aiWrittenItem.show();
}

function hideStatusBar(): void {
    seoScoreItem?.hide();
    aiWrittenItem?.hide();
    issuesStatusItem?.hide();
}

async function runAiWrittenDetection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('Open a file to run AI-written detection.');
        return;
    }
    const document = editor.document;
    if (!SUPPORTED_LANGUAGES.includes(document.languageId)) {
        vscode.window.showWarningMessage('AI-written detection runs on supported content files only.');
        return;
    }

    aiWrittenItem.text = '$(loading~spin) AI …';
    aiWrittenItem.tooltip = 'Running AI-written detection…';

    try {
        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Window,
                title: 'Estimating AI-written likelihood…'
            },
            (_progress, token) => detectAiWritten(document, token)
        );

        if (!result) {
            vscode.window.showErrorMessage(
                'AI-written detection unavailable. Install GitHub Copilot Chat (or another VS Code language model provider).'
            );
            updateStatusBar(document);
            return;
        }

        aiWrittenCache.set(document.uri.toString(), { version: document.version, result });
        updateStatusBar(document);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`AI-written detection failed: ${msg}`);
        updateStatusBar(document);
    }
}

async function scanWorkspace(): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Scanning workspace for SEO/AdSense issues…',
            cancellable: true
        },
        async (progress, token) => {
            const files = await vscode.workspace.findFiles(
                '**/*.{html,htm,php,jsx,tsx,md,vue,svelte}',
                '**/{node_modules,dist,build,.next,.nuxt,vendor}/**'
            );
            let totalIssues = 0;
            for (let i = 0; i < files.length; i++) {
                if (token.isCancellationRequested) break;
                progress.report({
                    message: `${i + 1}/${files.length}: ${files[i].path.split('/').pop()}`,
                    increment: 100 / files.length
                });
                try {
                    const doc = await vscode.workspace.openTextDocument(files[i]);
                    scanDocument(doc);
                    totalIssues += (diagnosticCollection.get(doc.uri) || []).length;
                } catch {
                    /* skip unreadable */
                }
            }
            vscode.window.showInformationMessage(
                `Workspace scan: ${files.length} file(s), ${totalIssues} issue(s). See Problems panel.`
            );
        }
    );
}

export function deactivate(): void {
    if (diagnosticCollection) diagnosticCollection.dispose();
}
