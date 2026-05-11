import * as vscode from 'vscode';
import { ISSUES } from './issues';
import { findAll, findFirst, extractMainContent, wordCount } from '../utils/htmlUtils';
import { Issue } from '../types';
import { push, rangeFor } from './_shared';

const PROHIBITED_PATTERNS: { name: string; re: RegExp }[] = [
    { name: 'adult content', re: /\b(porn|nsfw|escort|onlyfans|fetish)\b/gi },
    { name: 'illegal drugs', re: /\b(buy\s+(weed|cocaine|meth)|how\s+to\s+make\s+(meth|crack))\b/gi },
    { name: 'hacking/cracking', re: /\b(hack\s+(facebook|instagram|whatsapp)|crack\s+(license|software)|nulled\s+(theme|plugin))\b/gi },
    { name: 'gambling promotion', re: /\b(bet\s+\$\d+|online\s+casino\s+(real|usa)|deposit\s+bonus)\b/gi },
    { name: 'weapons/violence', re: /\b(buy\s+(gun|ammo)|how\s+to\s+make\s+(bomb|explosive))\b/gi },
    { name: 'counterfeit goods', re: /\b(replica\s+(rolex|gucci|louis\s+vuitton)|fake\s+(passport|id))\b/gi }
];

export function analyzeAdsense(document: vscode.TextDocument, source: string): Issue[] {
    const out: Issue[] = [];
    const config = vscode.workspace.getConfiguration('seoAdsense');
    if (!config.get<boolean>('checkAdSensePolicy', true)) return out;

    const text = extractMainContent(source);
    const words = wordCount(text);

    checkAdSenseScript(document, source, out);
    checkAdUnits(document, source, out, words);
    checkRequiredPages(document, source, out);
    checkProhibitedContent(document, source, out);

    return out;
}

function checkAdSenseScript(document: vscode.TextDocument, source: string, out: Issue[]) {
    const scripts = findAll(
        source,
        /<script\b[^>]*?(?:adsbygoogle|pagead2\.googlesyndication\.com)[^>]*>[\s\S]*?<\/script>/gi
    );

    if (scripts.length === 0) {
        const loaders = findAll(
            source,
            /<script\b[^>]*?src\s*=\s*["'][^"']*pagead2\.googlesyndication\.com[^"']*["'][^>]*>\s*<\/script>/gi
        );
        if (loaders.length > 1) {
            for (const s of loaders.slice(1)) {
                push(out, ISSUES.ADSENSE_MISPLACED_SCRIPT, rangeFor(document, s.start, s.end), {
                    message: 'Duplicate AdSense script tag — include it only once per page.'
                });
            }
        }
        return;
    }

    if (scripts.length > 1) {
        for (const s of scripts.slice(1)) {
            push(out, ISSUES.ADSENSE_MISPLACED_SCRIPT, rangeFor(document, s.start, s.end), {
                message: 'Duplicate AdSense script tag — include it only once per page.'
            });
        }
    }
}

function checkAdUnits(document: vscode.TextDocument, source: string, out: Issue[], words: number) {
    const adBlocks = findAll(
        source,
        /<ins\b[^>]*?class\s*=\s*["'][^"']*adsbygoogle[^"']*["'][^>]*>[\s\S]*?<\/ins>/gi
    );

    const autoAds = findFirst(
        source,
        /<script\b[^>]*?data-ad-client\s*=\s*["'][^"']+["'][^>]*>/gi
    );

    if (autoAds && words < 200) {
        push(out, ISSUES.ADSENSE_AUTO_ADS_BUT_NO_CONTENT, rangeFor(document, autoAds.start, autoAds.end), {
            message: `Auto ads enabled on a page with only ${words} words. AdSense will reject this.`
        });
    }

    if (adBlocks.length >= 3 && words < 800) {
        for (const ad of adBlocks.slice(2)) {
            push(out, ISSUES.ADSENSE_TOO_MANY_ADS, rangeFor(document, ad.start, ad.end), {
                message: `${adBlocks.length} ad units on a ${words}-word page. Reduce density or expand content.`
            });
        }
    }

    for (const ad of adBlocks) {
        const before = source.slice(Math.max(0, ad.start - 400), ad.start);
        const navProximity = /<\/nav>\s*$/i.test(before) || /<\/header>\s*$/i.test(before);
        const inNav = /<nav\b[^>]*>(?:(?!<\/nav>)[\s\S])*$/i.test(before);
        if (navProximity || inNav) {
            push(out, ISSUES.ADSENSE_AD_NEAR_NAV, rangeFor(document, ad.start, ad.end));
        }

        const beforeText = extractMainContent(source.slice(0, ad.start));
        if (wordCount(beforeText) < 50 && words > 50) {
            push(out, ISSUES.ADSENSE_AD_ABOVE_CONTENT, rangeFor(document, ad.start, ad.end), {
                message: `Only ${wordCount(beforeText)} words of content before this ad. Move it below substantive content.`
            });
        }
    }
}

function checkRequiredPages(document: vscode.TextDocument, source: string, out: Issue[]) {
    if (!/<\/body>/i.test(source) && !/<footer\b/i.test(source)) return;

    const lowerSource = source.toLowerCase();
    const hasPrivacy =
        /privacy[\s\-_]?policy/.test(lowerSource) ||
        /href\s*=\s*["'][^"']*\/privacy/.test(lowerSource);
    const hasAbout =
        /\babout\s+us\b/.test(lowerSource) ||
        /href\s*=\s*["'][^"']*\/about/.test(lowerSource);
    const hasContact =
        /\bcontact\s+us\b/.test(lowerSource) ||
        /href\s*=\s*["'][^"']*\/contact/.test(lowerSource);

    const footerMatch = findFirst(source, /<footer\b[^>]*>/gi);
    const r = footerMatch
        ? rangeFor(document, footerMatch.start, footerMatch.end)
        : new vscode.Range(0, 0, 0, 1);

    if (!hasPrivacy) push(out, ISSUES.ADSENSE_NO_PRIVACY_POLICY, r);
    if (!hasAbout) push(out, ISSUES.ADSENSE_NO_ABOUT, r);
    if (!hasContact) push(out, ISSUES.ADSENSE_NO_CONTACT, r);
}

function checkProhibitedContent(document: vscode.TextDocument, source: string, out: Issue[]) {
    const text = extractMainContent(source);
    for (const pat of PROHIBITED_PATTERNS) {
        const m = pat.re.exec(text);
        if (m) {
            const re = new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const sm = source.match(re);
            const start = sm ? source.indexOf(sm[0]) : 0;
            const end = start + (sm ? sm[0].length : 1);
            push(out, ISSUES.ADSENSE_PROHIBITED_CONTENT, rangeFor(document, start, end), {
                message: `Phrase "${m[0]}" may trigger AdSense ${pat.name} policy review.`,
                context: { phrase: m[0], category: pat.name }
            });
            pat.re.lastIndex = 0;
        }
    }
}
