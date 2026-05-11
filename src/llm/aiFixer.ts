import * as vscode from 'vscode';
import { ISSUES } from '../analyzers/issues';

/**
 * Pick the best available language model based on user preference + what's actually installed.
 */
export async function selectModel(): Promise<vscode.LanguageModelChat | null> {
    const config = vscode.workspace.getConfiguration('seoAdsense');
    const preference = config.get<string>('languageModel', 'auto');

    const selectors: vscode.LanguageModelChatSelector[] = [];
    if (preference === 'copilot-claude-3.5-sonnet') {
        selectors.push({ vendor: 'copilot', family: 'claude-3.5-sonnet' });
    } else if (preference === 'copilot-gpt-4o') {
        selectors.push({ vendor: 'copilot', family: 'gpt-4o' });
    } else if (preference === 'copilot-gpt-4') {
        selectors.push({ vendor: 'copilot', family: 'gpt-4' });
    }

    selectors.push(
        { vendor: 'copilot', family: 'claude-3.5-sonnet' },
        { vendor: 'copilot', family: 'gpt-4o' },
        { vendor: 'copilot', family: 'gpt-4' },
        { vendor: 'copilot' },
        {}
    );

    for (const sel of selectors) {
        try {
            const models = await vscode.lm.selectChatModels(sel);
            if (models && models.length > 0) return models[0];
        } catch {
            // fall through
        }
    }
    return null;
}

/**
 * Stream a chat request and accumulate the full text response.
 */
export async function streamRequest(
    model: vscode.LanguageModelChat,
    messages: vscode.LanguageModelChatMessage[],
    token: vscode.CancellationToken
): Promise<string> {
    const request = await model.sendRequest(messages, {}, token);
    let response = '';
    for await (const chunk of request.text) {
        response += chunk;
    }
    return response;
}

function stripFences(text: string): string {
    if (!text) return text;
    const fence = text.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```\s*$/);
    if (fence) return fence[1];
    return text;
}

function buildPrompt(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    snippet: string,
    fullSource: string
): vscode.LanguageModelChatMessage[] {
    const code = String(diagnostic.code ?? '');
    const issueDef = Object.values(ISSUES).find(i => i.id === code) || null;
    const hint = issueDef ? issueDef.aiPromptHint : 'Fix the issue described in the diagnostic.';

    const systemMessage =
        'You are an expert SEO and Google AdSense compliance assistant integrated into VS Code. ' +
        'Your job is to fix the specific issue described, and ONLY that issue. ' +
        'Respond with the corrected snippet of source code that should replace the highlighted region. ' +
        'Do not include explanations, prose, markdown headings, or code fences — output raw replacement text only. ' +
        'Preserve all surrounding formatting, indentation, and unrelated content exactly. ' +
        'If inserting new content (e.g. a meta tag), include only the tag(s) to insert.';

    const userMessage =
        `Language: ${document.languageId}\n` +
        `Issue code: ${code}\n` +
        `Issue description: ${diagnostic.message}\n` +
        `Fix instruction: ${hint}\n\n` +
        `--- HIGHLIGHTED SNIPPET ---\n${snippet}\n--- END SNIPPET ---\n\n` +
        `For broader context, here is the document (truncated if long):\n` +
        `--- DOCUMENT ---\n${truncate(fullSource, 6000)}\n--- END DOCUMENT ---\n\n` +
        `Return ONLY the replacement text for the highlighted snippet. ` +
        `If the fix is to insert a new tag inside <head>, return the existing <head> opening tag followed by the new tag on a new line.`;

    return [
        vscode.LanguageModelChatMessage.User(systemMessage + '\n\n' + userMessage)
    ];
}

function truncate(s: string, n: number): string {
    if (!s || s.length <= n) return s || '';
    return s.slice(0, n) + '\n...(truncated)';
}

export async function fixWithAI(
    document: vscode.TextDocument,
    range: vscode.Range,
    diagnostic: vscode.Diagnostic
): Promise<void> {
    if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') {
        vscode.window.showErrorMessage(
            'The VS Code Language Model API is unavailable. Update VS Code to 1.90 or newer and ensure a chat extension (GitHub Copilot Chat) is installed.'
        );
        return;
    }

    const model = await selectModel();
    if (!model) {
        const action = await vscode.window.showErrorMessage(
            'No language model available. Install GitHub Copilot Chat to enable AI fixes.',
            'Install Copilot Chat'
        );
        if (action) {
            vscode.commands.executeCommand(
                'workbench.extensions.installExtension',
                'GitHub.copilot-chat'
            );
        }
        return;
    }

    const snippet = document.getText(range);
    const fullSource = document.getText();
    const messages = buildPrompt(document, diagnostic, snippet, fullSource);

    try {
        const replacement = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Fixing "${diagnostic.code}" with ${model.name || model.family || 'AI'}…`,
                cancellable: true
            },
            (_progress, token) => streamRequest(model, messages, token)
        );

        const cleaned = stripFences(replacement).trim();
        if (!cleaned) {
            vscode.window.showWarningMessage('AI returned an empty response. No changes applied.');
            return;
        }

        const accept = await previewAndConfirm(document, range, snippet, cleaned);
        if (!accept) return;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, range, cleaned);
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage(`Applied AI fix for ${diagnostic.code}.`);
    } catch (err) {
        if (err instanceof vscode.LanguageModelError) {
            vscode.window.showErrorMessage(`Language model error: ${err.message}`);
        } else {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`AI fix failed: ${msg}`);
        }
    }
}

async function previewAndConfirm(
    document: vscode.TextDocument,
    range: vscode.Range,
    original: string,
    replacement: string
): Promise<boolean> {
    const choice = await vscode.window.showInformationMessage(
        'AI fix ready. Apply the change?',
        { modal: true, detail: `Original (${original.length} chars) → New (${replacement.length} chars).\n\nFirst 200 chars of replacement:\n${replacement.slice(0, 200)}${replacement.length > 200 ? '…' : ''}` },
        'Apply',
        'Show Diff',
        'Cancel'
    );
    if (choice === 'Apply') return true;
    if (choice === 'Cancel' || !choice) return false;

    const tempDoc = await vscode.workspace.openTextDocument({ content: replacement, language: document.languageId });
    await vscode.window.showTextDocument(tempDoc, { viewColumn: vscode.ViewColumn.Beside, preview: true });

    const confirm = await vscode.window.showInformationMessage(
        'Apply the AI fix to the original file?',
        { modal: true },
        'Apply',
        'Cancel'
    );
    return confirm === 'Apply';
}

export async function fixAllInDocument(
    document: vscode.TextDocument,
    diagnostics: readonly vscode.Diagnostic[]
): Promise<void> {
    let fixed = 0;
    for (const diag of diagnostics) {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.toString() === document.uri.toString()) {
            await fixWithAI(editor.document, diag.range, diag);
            fixed++;
        }
    }
    vscode.window.showInformationMessage(`Attempted AI fix on ${fixed} issue(s).`);
}
