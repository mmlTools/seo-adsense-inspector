import * as vscode from 'vscode';
import { ISSUES } from './issues';
import { findAll, looksLikeArticle, looksLikeFullDocument } from '../utils/htmlUtils';
import { Issue } from '../types';
import { push, rangeFor } from './_shared';

export function analyzeSchema(document: vscode.TextDocument, source: string): Issue[] {
    const out: Issue[] = [];
    const config = vscode.workspace.getConfiguration('seoAdsense');
    if (!config.get<boolean>('checkSchema', true)) return out;

    const blocks = findAll(
        source,
        /<script\b[^>]*?type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    );

    if (blocks.length === 0) {
        if (looksLikeArticle(source) || looksLikeFullDocument(source)) {
            push(out, ISSUES.SCHEMA_MISSING, new vscode.Range(0, 0, 0, 1));
        }
        return out;
    }

    for (const block of blocks) {
        const raw = block.match[1].trim();
        if (!raw) continue;

        const range = rangeFor(document, block.start, block.end);

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            push(out, ISSUES.SCHEMA_INVALID_JSON, range, {
                message: `Invalid JSON-LD: ${msg}`,
                context: { error: msg }
            });
            continue;
        }

        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items as any[]) {
            if (typeof item !== 'object' || item === null) continue;
            const ctx = item['@context'];
            const type = item['@type'];
            if (!ctx || (typeof ctx === 'string' && !/schema\.org/i.test(ctx))) {
                push(out, ISSUES.SCHEMA_MISSING_CONTEXT, range);
            }
            if (!type) {
                push(out, ISSUES.SCHEMA_MISSING_TYPE, range);
            }
        }
    }

    return out;
}
