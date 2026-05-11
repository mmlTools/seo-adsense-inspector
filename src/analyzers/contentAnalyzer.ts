import * as vscode from 'vscode';
import { ISSUES } from './issues';
import { extractMainContent, wordCount, parseFrontMatter } from '../utils/htmlUtils';
import { Issue } from '../types';

export function analyzeContent(document: vscode.TextDocument, source: string): Issue[] {
    const out: Issue[] = [];
    const config = vscode.workspace.getConfiguration('seoAdsense');
    const minWords = config.get<number>('minWordCount', 300);

    let body = source;
    if (document.languageId === 'markdown') {
        const fm = parseFrontMatter(source);
        body = source.slice(fm.bodyOffset);
    }

    const text = extractMainContent(body);
    const words = wordCount(text);

    if (words === 0) return out;

    // Server-rendered templates (PHP/CI4 partials, JSX components, Vue/Svelte SFCs) usually
    // pull their actual content from variables/props at runtime — counting only the static
    // literal text would produce false "thin content" reports. Only flag PHP/JSX/etc. when
    // they really do contain a full HTML document with substantial inline copy.
    const isFullDoc = /<html\b/i.test(source) || /<!doctype\s+html/i.test(source);
    const templateLike = ['php', 'javascriptreact', 'typescriptreact', 'vue', 'svelte'].includes(document.languageId);
    if (templateLike && !isFullDoc) return out;

    const looksLikeContent =
        document.languageId === 'markdown' ||
        /<article\b/i.test(source) ||
        /<main\b/i.test(source) ||
        /class\s*=\s*["'][^"']*(post|article|entry|content|prose)/i.test(source);

    if (!looksLikeContent && document.languageId !== 'html') return out;

    const range = new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0);

    if (words < 200) {
        out.push({
            code: ISSUES.VERY_THIN_CONTENT.id,
            category: 'content',
            title: ISSUES.VERY_THIN_CONTENT.title,
            message: `Very thin content: ${words} words. AdSense will almost certainly flag this page (recommended ≥ ${minWords}, ideally ≥ ${config.get<number>('recommendedWordCount', 800)}).`,
            severity: vscode.DiagnosticSeverity.Error,
            range,
            fixable: true,
            context: { wordCount: words }
        });
    } else if (words < minWords) {
        out.push({
            code: ISSUES.THIN_CONTENT.id,
            category: 'content',
            title: ISSUES.THIN_CONTENT.title,
            message: `Thin content: ${words} words (recommended ≥ ${minWords}). Expand with examples, context, or details.`,
            severity: vscode.DiagnosticSeverity.Warning,
            range,
            fixable: true,
            context: { wordCount: words }
        });
    }

    return out;
}
