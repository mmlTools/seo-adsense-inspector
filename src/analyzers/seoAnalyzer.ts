import * as vscode from 'vscode';
import { ISSUES } from './issues';
import { findAll, findFirst, getAttr, hasAttr, looksLikeFullDocument, looksLikeArticle } from '../utils/htmlUtils';
import { Issue } from '../types';
import { push, rangeFor } from './_shared';

export function analyzeSeo(document: vscode.TextDocument, source: string): Issue[] {
    const out: Issue[] = [];
    const config = vscode.workspace.getConfiguration('seoAdsense');

    const isFullDoc = looksLikeFullDocument(source);
    const isArticle = looksLikeArticle(source);

    checkTitle(document, source, out, config, isFullDoc);
    checkMetaDescription(document, source, out, config, isFullDoc);
    checkCanonical(document, source, out, isFullDoc);
    checkViewportAndCharset(document, source, out, isFullDoc);
    checkHeadings(document, source, out);
    checkImages(document, source, out);

    if (isArticle || isFullDoc) {
        checkInternalLinks(document, source, out, config);
    }

    return out;
}

function checkTitle(document: vscode.TextDocument, source: string, out: Issue[], config: vscode.WorkspaceConfiguration, isFullDoc: boolean) {
    if (!isFullDoc) return;

    const titleMatch = findFirst(source, /<title\b[^>]*>([\s\S]*?)<\/title>/gi);
    if (!titleMatch) {
        const headMatch = findFirst(source, /<head\b[^>]*>/gi);
        const r = headMatch
            ? rangeFor(document, headMatch.start, headMatch.end)
            : new vscode.Range(0, 0, 0, 1);
        push(out, ISSUES.MISSING_TITLE, r);
        return;
    }

    const titleText = titleMatch.match[1].trim();
    const range = rangeFor(document, titleMatch.start, titleMatch.end);

    if (titleText.length > config.get<number>('titleMax', 60)) {
        push(out, ISSUES.LONG_TITLE, range, {
            message: `<title> is ${titleText.length} chars (recommended ≤ ${config.get<number>('titleMax', 60)}).`,
            context: { current: titleText }
        });
    } else if (titleText.length > 0 && titleText.length < config.get<number>('titleMin', 30)) {
        push(out, ISSUES.SHORT_TITLE, range, {
            message: `<title> is only ${titleText.length} chars (recommended ≥ ${config.get<number>('titleMin', 30)}).`,
            context: { current: titleText }
        });
    }
}

function checkMetaDescription(document: vscode.TextDocument, source: string, out: Issue[], config: vscode.WorkspaceConfiguration, isFullDoc: boolean) {
    if (!isFullDoc) return;

    const metas = findAll(source, /<meta\b[^>]*?name\s*=\s*["']description["'][^>]*>/gi);
    if (metas.length === 0) {
        const headMatch = findFirst(source, /<head\b[^>]*>/gi);
        const r = headMatch ? rangeFor(document, headMatch.start, headMatch.end) : new vscode.Range(0, 0, 0, 1);
        push(out, ISSUES.MISSING_META_DESCRIPTION, r);
        return;
    }

    const meta = metas[0];
    const content = getAttr(meta.match[0], 'content') || '';
    const r = rangeFor(document, meta.start, meta.end);

    if (content.length < config.get<number>('metaDescriptionMin', 120)) {
        push(out, ISSUES.SHORT_META_DESCRIPTION, r, {
            message: `Meta description is ${content.length} chars (recommended ${config.get<number>('metaDescriptionMin', 120)}–${config.get<number>('metaDescriptionMax', 160)}).`,
            context: { current: content }
        });
    } else if (content.length > config.get<number>('metaDescriptionMax', 160)) {
        push(out, ISSUES.LONG_META_DESCRIPTION, r, {
            message: `Meta description is ${content.length} chars (will truncate in SERPs at ~${config.get<number>('metaDescriptionMax', 160)}).`,
            context: { current: content }
        });
    }
}

function checkCanonical(document: vscode.TextDocument, source: string, out: Issue[], isFullDoc: boolean) {
    if (!isFullDoc) return;

    const canonicals = findAll(source, /<link\b[^>]*?rel\s*=\s*["']canonical["'][^>]*>/gi);
    if (canonicals.length === 0) {
        const headMatch = findFirst(source, /<head\b[^>]*>/gi);
        const r = headMatch ? rangeFor(document, headMatch.start, headMatch.end) : new vscode.Range(0, 0, 0, 1);
        push(out, ISSUES.MISSING_CANONICAL, r);
        return;
    }

    const tag = canonicals[0];
    const href = getAttr(tag.match[0], 'href') || '';
    const r = rangeFor(document, tag.start, tag.end);

    if (!href || href === '#' || /^\/\s*$/.test(href) || !/^https?:\/\//i.test(href)) {
        push(out, ISSUES.BAD_CANONICAL, r, {
            message: `Canonical href "${href || '(empty)'}" should be an absolute https:// URL.`,
            context: { current: href }
        });
    }
}

function checkViewportAndCharset(document: vscode.TextDocument, source: string, out: Issue[], isFullDoc: boolean) {
    if (!isFullDoc) return;

    if (!findFirst(source, /<meta\b[^>]*?name\s*=\s*["']viewport["'][^>]*>/gi)) {
        const headMatch = findFirst(source, /<head\b[^>]*>/gi);
        const r = headMatch ? rangeFor(document, headMatch.start, headMatch.end) : new vscode.Range(0, 0, 0, 1);
        push(out, ISSUES.MISSING_VIEWPORT, r);
    }

    if (!findFirst(source, /<meta\b[^>]*?charset\s*=/gi)) {
        const headMatch = findFirst(source, /<head\b[^>]*>/gi);
        const r = headMatch ? rangeFor(document, headMatch.start, headMatch.end) : new vscode.Range(0, 0, 0, 1);
        push(out, ISSUES.MISSING_CHARSET, r);
    }
}

function checkHeadings(document: vscode.TextDocument, source: string, out: Issue[]) {
    const headings = findAll(source, /<h([1-6])\b[^>]*>/gi);
    if (headings.length === 0) {
        const hasBody = /<body\b/i.test(source) || /<article\b/i.test(source) || /<main\b/i.test(source);
        if (hasBody) {
            push(out, ISSUES.MISSING_H1, new vscode.Range(0, 0, 0, 1));
        }
        return;
    }

    const levels = headings.map(h => ({ level: parseInt(h.match[1], 10), start: h.start, end: h.end }));
    const h1Count = levels.filter(h => h.level === 1).length;

    if (h1Count === 0) {
        push(out, ISSUES.MISSING_H1, rangeFor(document, levels[0].start, levels[0].end));
    } else if (h1Count > 1) {
        const extraH1s = levels.filter(h => h.level === 1).slice(1);
        for (const h of extraH1s) {
            push(out, ISSUES.MULTIPLE_H1, rangeFor(document, h.start, h.end));
        }
    }

    let prev: number | null = null;
    for (const h of levels) {
        if (prev !== null && h.level - prev > 1) {
            push(out, ISSUES.HEADING_SKIP, rangeFor(document, h.start, h.end), {
                message: `Heading jumps from h${prev} to h${h.level}.`
            });
        }
        prev = h.level;
    }
}

function checkImages(document: vscode.TextDocument, source: string, out: Issue[]) {
    const imgs = findAll(source, /<img\b[^>]*>/gi);
    for (const img of imgs) {
        const tag = img.match[0];
        const range = rangeFor(document, img.start, img.end);

        const alt = getAttr(tag, 'alt');
        if (alt === null && !hasAttr(tag, 'alt')) {
            push(out, ISSUES.IMG_MISSING_ALT, range);
        } else if (alt === '') {
            push(out, ISSUES.IMG_EMPTY_ALT, range);
        }
    }
}

function checkInternalLinks(document: vscode.TextDocument, source: string, out: Issue[], config: vscode.WorkspaceConfiguration) {
    const anchors = findAll(source, /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi);
    let internal = 0;
    for (const a of anchors) {
        const href = a.match[1];
        if (!href) continue;
        const isExternal = /^https?:\/\//i.test(href) || /^\/\//.test(href);
        const isHash = href.startsWith('#');
        const isMailto = /^(mailto|tel|javascript):/i.test(href);
        if (!isExternal && !isHash && !isMailto) internal++;
    }

    if (anchors.length > 0 && internal === 0) {
        push(out, ISSUES.NO_INTERNAL_LINKS, new vscode.Range(0, 0, 0, 1));
    } else if (internal > 0 && internal < config.get<number>('minInternalLinks', 2)) {
        push(out, ISSUES.FEW_INTERNAL_LINKS, new vscode.Range(0, 0, 0, 1), {
            message: `Only ${internal} internal link${internal === 1 ? '' : 's'} found (recommended ≥ ${config.get<number>('minInternalLinks', 2)}).`
        });
    }
}
