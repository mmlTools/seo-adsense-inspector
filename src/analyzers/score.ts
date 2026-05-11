import * as vscode from 'vscode';
import { Issue } from '../types';
import { extractMainContent, wordCount } from '../utils/htmlUtils';

/**
 * Compute a 0-100 readiness score for SEO/AdSense based on detected issues and word count.
 * Mirrors the heuristic used in the review panel.
 */
export function computeSeoScore(issues: Issue[], words: number): { score: number; errors: number; warnings: number; infos: number } {
    const errors = issues.filter(i => i.severity === vscode.DiagnosticSeverity.Error).length;
    const warnings = issues.filter(i => i.severity === vscode.DiagnosticSeverity.Warning).length;
    const infos = issues.filter(i => i.severity === vscode.DiagnosticSeverity.Information).length;

    let score = 100;
    score -= errors * 20;
    score -= warnings * 7;
    score -= infos * 2;
    if (words < 200) score -= 25;
    else if (words < 500) score -= 10;
    score = Math.max(0, Math.min(100, score));
    return { score, errors, warnings, infos };
}

/** Extract the visible prose word count for a document, language-aware. */
export function scoreWordCount(document: vscode.TextDocument, source: string): number {
    if (document.languageId === 'markdown') {
        // Drop YAML front-matter
        const fm = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
        const body = fm ? source.slice(fm[0].length) : source;
        return wordCount(extractMainContent(body));
    }
    return wordCount(extractMainContent(source));
}
