import * as vscode from 'vscode';
import { ISSUES } from './issues';
import { findAll, getAttr, hasAttr } from '../utils/htmlUtils';
import { Issue } from '../types';
import { push, rangeFor } from './_shared';

export function analyzePerformance(document: vscode.TextDocument, source: string): Issue[] {
    const out: Issue[] = [];
    const config = vscode.workspace.getConfiguration('seoAdsense');
    if (!config.get<boolean>('checkCWV', true)) return out;

    checkImages(document, source, out);
    checkScripts(document, source, out);
    checkInlineStyles(document, source, out);

    return out;
}

function checkImages(document: vscode.TextDocument, source: string, out: Issue[]) {
    const imgs = findAll(source, /<img\b[^>]*>/gi);
    let imgIndex = 0;
    for (const img of imgs) {
        const tag = img.match[0];
        const range = rangeFor(document, img.start, img.end);

        const hasWidth = getAttr(tag, 'width') !== null;
        const hasHeight = getAttr(tag, 'height') !== null;
        const hasAspectRatio = /style\s*=\s*["'][^"']*aspect-ratio/i.test(tag);

        if (!hasWidth && !hasHeight && !hasAspectRatio) {
            push(out, ISSUES.IMG_NO_DIMENSIONS, range);
        }

        const loading = getAttr(tag, 'loading');
        if (imgIndex > 0 && (!loading || loading === '')) {
            push(out, ISSUES.IMG_NO_LAZY_LOAD, range);
        }
        imgIndex++;
    }
}

function checkScripts(document: vscode.TextDocument, source: string, out: Issue[]) {
    const headMatch = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
    if (!headMatch) return;

    const headStart = source.indexOf(headMatch[0]);
    const headContent = headMatch[1];
    const headContentStart = headStart + headMatch[0].indexOf(headContent);

    const scripts = findAll(headContent, /<script\b[^>]*?src\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi);
    for (const s of scripts) {
        const tag = s.match[0];
        if (hasAttr(tag, 'async') || hasAttr(tag, 'defer')) continue;
        if (/googletagmanager|gtag|adsbygoogle|googlesyndication/i.test(tag)) continue;
        const absStart = headContentStart + s.start;
        const absEnd = headContentStart + s.end;
        push(out, ISSUES.RENDER_BLOCKING_SCRIPT, rangeFor(document, absStart, absEnd));
    }
}

function checkInlineStyles(document: vscode.TextDocument, source: string, out: Issue[]) {
    const styles = findAll(source, /<style\b[^>]*>([\s\S]*?)<\/style>/gi);
    for (const s of styles) {
        const inner = s.match[1] || '';
        if (inner.length > 14000) {
            push(out, ISSUES.INLINE_LARGE_STYLE, rangeFor(document, s.start, s.end), {
                message: `Inline <style> is ${Math.round(inner.length / 1024)} KB — extract non-critical CSS.`
            });
        }
    }
}
