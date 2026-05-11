import * as vscode from 'vscode';
import { analyzeSeo } from './seoAnalyzer';
import { analyzeContent } from './contentAnalyzer';
import { analyzeAdsense } from './adsenseAnalyzer';
import { analyzeSchema } from './schemaAnalyzer';
import { analyzePerformance } from './performanceAnalyzer';
import { ISSUES } from './issues';
import { Issue } from '../types';
import { getAnalysisSource } from '../utils/htmlUtils';

export const SUPPORTED_LANGUAGES = [
    'html',
    'php',
    'javascriptreact',
    'typescriptreact',
    'markdown',
    'vue',
    'svelte'
];

export { ISSUES };

/**
 * Run every analyzer over a TextDocument and return the combined issue list.
 */
export function analyzeDocument(document: vscode.TextDocument): Issue[] {
    if (!SUPPORTED_LANGUAGES.includes(document.languageId)) return [];

    const raw = document.getText();
    if (!raw || raw.length === 0) return [];

    // For PHP, blank out server-side code blocks (preserving offsets) so the
    // remaining static HTML is what's linted. Avoids treating `<?php ... ?>`
    // bodies as content/prohibited text and prevents false "missing" matches
    // hidden inside PHP blocks.
    const source = getAnalysisSource(document.languageId, raw);

    const issues: Issue[] = [];

    try {
        issues.push(...analyzeSeo(document, source));
        issues.push(...analyzeContent(document, source));
        issues.push(...analyzeAdsense(document, source));
        issues.push(...analyzeSchema(document, source));
        issues.push(...analyzePerformance(document, source));
    } catch (err) {
        console.error('SEO/AdSense analyzer error:', err);
    }

    return issues;
}
