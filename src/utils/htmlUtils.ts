import { RegexMatch } from '../types';

/**
 * Lightweight HTML utilities used by every analyzer.
 *
 * Why regex and not a full DOM parser?
 *   - VS Code extensions ship better with zero runtime dependencies.
 *   - We only need approximate locations + content, not a real DOM.
 *   - The user is editing source, often with templating noise (PHP, JSX),
 *     which a real HTML parser would choke on anyway.
 */

/** Strip HTML tags and decode common entities to get plain text. */
export function stripHtml(html: string): string {
    if (!html) return '';
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/** Word count of plain text. */
export function wordCount(text: string): number {
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Replace PHP code blocks (<?php ... ?>, <?= ... ?>, <? ... ?>) with spaces of
 * equal length so character offsets remain stable. This lets every analyzer
 * keep using regex over the source while ignoring server-side code.
 */
export function stripPhp(source: string): string {
    if (!source || source.indexOf('<?') === -1) return source;
    return source.replace(/<\?(?:php|=)?[\s\S]*?\?>/gi, (match) => {
        // Preserve newlines so line numbers don't shift; replace everything else with spaces.
        return match.replace(/[^\n]/g, ' ');
    });
}

/**
 * Return a preprocessed source string suitable for regex-based analysis,
 * given the document language. For PHP we blank out PHP blocks so the
 * remaining static HTML is what we lint against.
 */
export function getAnalysisSource(languageId: string, source: string): string {
    if (languageId === 'php') return stripPhp(source);
    return source;
}

/**
 * Find all occurrences of a regex in source text. Returns matches with
 * absolute character offset (suitable for converting to a vscode.Range).
 */
export function findAll(source: string, regex: RegExp): RegexMatch[] {
    if (!regex.global) {
        throw new Error('findAll requires a global regex');
    }
    const out: RegexMatch[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(source)) !== null) {
        out.push({
            match: m,
            start: m.index,
            end: m.index + m[0].length
        });
        if (m.index === regex.lastIndex) regex.lastIndex++;
    }
    return out;
}

/** First match helper. */
export function findFirst(source: string, regex: RegExp): RegexMatch | null {
    const all = findAll(source, regex);
    return all.length ? all[0] : null;
}

/** Get attribute value from a tag opening string like `<img src="x" alt="y">`. */
export function getAttr(tagOpening: string, attr: string): string | null {
    const re = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const m = tagOpening.match(re);
    if (!m) return null;
    return m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
}

/** True if a tag opening contains a given boolean attribute. */
export function hasAttr(tagOpening: string, attr: string): boolean {
    return new RegExp(`\\b${attr}\\b`, 'i').test(tagOpening);
}

/** Quickly check whether the document looks like a full HTML document or a fragment. */
export function looksLikeFullDocument(source: string): boolean {
    return /<html\b/i.test(source) || /<!doctype\s+html/i.test(source);
}

/** Detect if the document looks like an article/blog post (vs a layout/template). */
export function looksLikeArticle(source: string): boolean {
    const text = stripHtml(source);
    if (wordCount(text) < 100) return false;
    return (
        /<article\b/i.test(source) ||
        /<main\b/i.test(source) ||
        /class\s*=\s*["'][^"']*(post|article|entry|blog)/i.test(source) ||
        /<h1\b/i.test(source)
    );
}

/** Extract the body content for word counting, ignoring head/script/style/nav/footer. */
export function extractMainContent(source: string): string {
    let content = source;

    const mainMatch = content.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
    if (mainMatch) content = mainMatch[1];

    content = content
        .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
        .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
        .replace(/<form\b[\s\S]*?<\/form>/gi, ' ');

    return stripHtml(content);
}

export interface FrontMatterResult {
    data: Record<string, string>;
    bodyOffset: number;
}

/** Detect Markdown front-matter (YAML between --- lines). */
export function parseFrontMatter(source: string): FrontMatterResult {
    const m = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!m) return { data: {}, bodyOffset: 0 };
    const data: Record<string, string> = {};
    m[1].split('\n').forEach(line => {
        const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!kv) return;
        let val = kv[2].trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        data[kv[1].toLowerCase()] = val;
    });
    return { data, bodyOffset: m[0].length };
}

/** Convert a 0-based character offset to a {line, character} position object. */
export function offsetToPosition(source: string, offset: number): { line: number; character: number } {
    let line = 0;
    let lastNewline = -1;
    for (let i = 0; i < offset && i < source.length; i++) {
        if (source.charCodeAt(i) === 10) {
            line++;
            lastNewline = i;
        }
    }
    return { line, character: offset - lastNewline - 1 };
}
