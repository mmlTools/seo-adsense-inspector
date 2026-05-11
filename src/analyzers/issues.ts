import { IssueDef } from '../types';

/**
 * Single source of truth for all issue codes used across analyzers.
 */

type IssueMap = Record<string, IssueDef>;

export const ISSUES = {
    // --- Content / SEO ---
    THIN_CONTENT: {
        id: 'thin-content',
        category: 'content',
        severity: 'warning',
        title: 'Thin content',
        description:
            'Pages with very little unique content are penalized by Google and may be rejected by AdSense.',
        aiPromptHint:
            'Expand the article with 2-3 additional substantive paragraphs that add genuinely useful information (examples, context, caveats). Do not pad with filler.'
    },
    VERY_THIN_CONTENT: {
        id: 'very-thin-content',
        category: 'content',
        severity: 'error',
        title: 'Very thin content (AdSense risk)',
        description: 'Under 200 words. AdSense will almost certainly flag this page.',
        aiPromptHint:
            'This article is far too short for AdSense. Rewrite it as a genuinely useful piece of at least 600 words. Preserve the topic and any key points the author made.'
    },
    MISSING_H1: {
        id: 'missing-h1',
        category: 'seo',
        severity: 'warning',
        title: 'Missing <h1> heading',
        description: 'Every page should have exactly one descriptive H1.',
        aiPromptHint:
            'Insert a single descriptive <h1> near the top of the main content. Base it on the existing title or first paragraph.'
    },
    MULTIPLE_H1: {
        id: 'multiple-h1',
        category: 'seo',
        severity: 'warning',
        title: 'Multiple <h1> tags',
        description: 'A page should have one H1. Demote the others to H2.',
        aiPromptHint: 'Keep the first <h1> and demote subsequent <h1> tags to <h2>.'
    },
    HEADING_SKIP: {
        id: 'heading-skip',
        category: 'seo',
        severity: 'info',
        title: 'Heading level skipped',
        description: 'Heading hierarchy should not skip levels (e.g., H2 -> H4).',
        aiPromptHint: 'Adjust heading levels so the hierarchy is contiguous.'
    },
    MISSING_META_DESCRIPTION: {
        id: 'missing-meta-description',
        category: 'seo',
        severity: 'warning',
        title: 'Missing meta description',
        description: 'No <meta name="description"> tag found in the head.',
        aiPromptHint:
            'Write a compelling 140-160 character meta description summarizing the page. Insert it as a <meta name="description" content="..."> inside <head>.'
    },
    SHORT_META_DESCRIPTION: {
        id: 'short-meta-description',
        category: 'seo',
        severity: 'info',
        title: 'Meta description too short',
        description: 'Aim for 120-160 characters.',
        aiPromptHint: 'Rewrite the meta description to be 140-160 characters and keyword-rich.'
    },
    LONG_META_DESCRIPTION: {
        id: 'long-meta-description',
        category: 'seo',
        severity: 'info',
        title: 'Meta description too long',
        description: 'Will be truncated in search results.',
        aiPromptHint: 'Shorten the meta description to under 160 characters without losing key information.'
    },
    MISSING_TITLE: {
        id: 'missing-title',
        category: 'seo',
        severity: 'warning',
        title: 'Missing <title>',
        description: 'Every page must have a <title> tag.',
        aiPromptHint: 'Add a 50-60 character <title> tag based on the main heading.'
    },
    LONG_TITLE: {
        id: 'long-title',
        category: 'seo',
        severity: 'info',
        title: '<title> too long',
        description: 'Titles longer than ~60 chars get truncated in SERPs.',
        aiPromptHint: 'Tighten the <title> to under 60 characters.'
    },
    SHORT_TITLE: {
        id: 'short-title',
        category: 'seo',
        severity: 'info',
        title: '<title> too short',
        description: 'Short titles miss keyword opportunities.',
        aiPromptHint: 'Expand the <title> to ~50-60 characters with relevant keywords.'
    },
    MISSING_CANONICAL: {
        id: 'missing-canonical',
        category: 'seo',
        severity: 'info',
        title: 'Missing canonical tag',
        description: 'Helps Google identify the preferred URL for duplicate content.',
        aiPromptHint:
            'Insert a <link rel="canonical" href="..."> in the head. Use a placeholder URL if you cannot determine the real one.'
    },
    BAD_CANONICAL: {
        id: 'bad-canonical',
        category: 'seo',
        severity: 'warning',
        title: 'Suspicious canonical href',
        description: 'Canonical URL looks relative, empty, or self-referential when it should not be.',
        aiPromptHint: 'Replace the canonical href with a clean absolute URL using https://.'
    },
    NO_INTERNAL_LINKS: {
        id: 'no-internal-links',
        category: 'seo',
        severity: 'info',
        title: 'No internal links',
        description: 'Articles should link to other pages on the same site.',
        aiPromptHint:
            'Suggest 2-3 places in the article where internal links to related topics would help. Insert <a href="#"> placeholders.'
    },
    FEW_INTERNAL_LINKS: {
        id: 'few-internal-links',
        category: 'seo',
        severity: 'hint',
        title: 'Few internal links',
        description: 'Consider adding more contextual links to related content.',
        aiPromptHint: 'Recommend additional internal link opportunities and insert placeholders.'
    },
    IMG_MISSING_ALT: {
        id: 'img-missing-alt',
        category: 'seo',
        severity: 'warning',
        title: '<img> missing alt attribute',
        description: 'Required for accessibility and image SEO.',
        aiPromptHint: 'Add a descriptive alt attribute based on the image filename and surrounding context.'
    },
    IMG_EMPTY_ALT: {
        id: 'img-empty-alt',
        category: 'seo',
        severity: 'info',
        title: '<img> has empty alt',
        description: 'Empty alt is only correct for decorative images. Confirm intent.',
        aiPromptHint: 'If the image is decorative, leave alt="". Otherwise provide a descriptive alt.'
    },

    // --- AdSense compliance ---
    ADSENSE_NO_PRIVACY_POLICY: {
        id: 'adsense-no-privacy-policy',
        category: 'adsense',
        severity: 'warning',
        title: 'No link to a Privacy Policy',
        description:
            'AdSense requires a Privacy Policy on every page where ads appear. We could not find a /privacy or "Privacy Policy" link.',
        aiPromptHint: 'Add a footer link to /privacy-policy labeled "Privacy Policy".'
    },
    ADSENSE_NO_ABOUT: {
        id: 'adsense-no-about',
        category: 'adsense',
        severity: 'info',
        title: 'No "About" page link found',
        description: 'AdSense reviewers favor sites with About and Contact pages.',
        aiPromptHint: 'Add a footer link to /about labeled "About".'
    },
    ADSENSE_NO_CONTACT: {
        id: 'adsense-no-contact',
        category: 'adsense',
        severity: 'info',
        title: 'No "Contact" page link found',
        description: 'AdSense reviewers expect a way to reach the site owner.',
        aiPromptHint: 'Add a footer link to /contact labeled "Contact".'
    },
    ADSENSE_AD_NEAR_NAV: {
        id: 'adsense-ad-near-nav',
        category: 'adsense',
        severity: 'warning',
        title: 'Ad placed near navigation',
        description:
            'Ads adjacent to navigation menus or buttons cause accidental clicks and violate AdSense policy.',
        aiPromptHint:
            'Move this ad unit further from navigation. Add a margin or separator and place it inside content.'
    },
    ADSENSE_AD_ABOVE_CONTENT: {
        id: 'adsense-ad-above-content',
        category: 'adsense',
        severity: 'warning',
        title: 'Ad above any real content',
        description:
            'AdSense prohibits ads on pages without sufficient content. Ensure the ad appears below substantive content.',
        aiPromptHint: 'Move the first ad unit below the first 2-3 paragraphs of real content.'
    },
    ADSENSE_TOO_MANY_ADS: {
        id: 'adsense-too-many-ads',
        category: 'adsense',
        severity: 'warning',
        title: 'High ad density',
        description:
            'Three or more ad units in a short page risks "ads exceeding content" rejection.',
        aiPromptHint:
            'Remove or consolidate ad units. Maintain at least 2x more content than ads by visual weight.'
    },
    ADSENSE_AUTO_ADS_BUT_NO_CONTENT: {
        id: 'adsense-auto-ads-no-content',
        category: 'adsense',
        severity: 'error',
        title: 'Auto ads on near-empty page',
        description: 'Auto ads enabled on a page with less than 200 words is an immediate AdSense violation.',
        aiPromptHint:
            'Either remove the auto ads script for this template, or ensure the page has at least 600 words of substantive content.'
    },
    ADSENSE_PROHIBITED_CONTENT: {
        id: 'adsense-prohibited-content',
        category: 'adsense',
        severity: 'error',
        title: 'Potentially prohibited content',
        description:
            'Detected language often associated with AdSense-prohibited categories (adult, gambling, hacking, etc.). Manual review recommended.',
        aiPromptHint:
            'Review and rephrase this section to avoid content categories prohibited by the AdSense Program Policies.'
    },
    ADSENSE_MISPLACED_SCRIPT: {
        id: 'adsense-misplaced-script',
        category: 'adsense',
        severity: 'info',
        title: 'AdSense script placement',
        description:
            'The AdSense script should be in <head> (or just before </body>) and only included once per page.',
        aiPromptHint: 'Move the AdSense script into <head> and remove duplicates.'
    },

    // --- Schema / structured data ---
    SCHEMA_MISSING: {
        id: 'schema-missing',
        category: 'schema',
        severity: 'info',
        title: 'No JSON-LD structured data',
        description:
            'Articles benefit greatly from Article or BlogPosting schema for rich results.',
        aiPromptHint:
            'Generate a <script type="application/ld+json"> with a complete BlogPosting schema (headline, author, datePublished, image, publisher) based on the page content.'
    },
    SCHEMA_INVALID_JSON: {
        id: 'schema-invalid-json',
        category: 'schema',
        severity: 'error',
        title: 'Invalid JSON-LD',
        description: 'The JSON-LD block does not parse as valid JSON.',
        aiPromptHint: 'Fix the JSON syntax errors in this JSON-LD block without changing the data.'
    },
    SCHEMA_MISSING_CONTEXT: {
        id: 'schema-missing-context',
        category: 'schema',
        severity: 'warning',
        title: 'JSON-LD missing @context',
        description: 'Schema must include "@context": "https://schema.org".',
        aiPromptHint: 'Add "@context": "https://schema.org" to the JSON-LD object.'
    },
    SCHEMA_MISSING_TYPE: {
        id: 'schema-missing-type',
        category: 'schema',
        severity: 'warning',
        title: 'JSON-LD missing @type',
        description: 'Schema must declare an @type (e.g., Article, BlogPosting).',
        aiPromptHint: 'Add an appropriate "@type" to the JSON-LD block based on the page content.'
    },

    // --- Performance / Core Web Vitals ---
    IMG_NO_DIMENSIONS: {
        id: 'img-no-dimensions',
        category: 'performance',
        severity: 'warning',
        title: '<img> without width/height (CLS risk)',
        description:
            'Images without explicit dimensions cause Cumulative Layout Shift, hurting Core Web Vitals.',
        aiPromptHint:
            'Add width and height attributes (or CSS aspect-ratio) to this image to prevent layout shift.'
    },
    IMG_NO_LAZY_LOAD: {
        id: 'img-no-lazy-load',
        category: 'performance',
        severity: 'hint',
        title: '<img> not lazy-loaded',
        description:
            'Below-the-fold images should use loading="lazy" for faster LCP.',
        aiPromptHint: 'Add loading="lazy" to images below the fold, but NOT to the LCP image.'
    },
    RENDER_BLOCKING_SCRIPT: {
        id: 'render-blocking-script',
        category: 'performance',
        severity: 'info',
        title: 'Render-blocking script',
        description:
            'External <script> in <head> without async/defer blocks page rendering.',
        aiPromptHint: 'Add defer (or async, if order does not matter) to this <script> tag.'
    },
    INLINE_LARGE_STYLE: {
        id: 'inline-large-style',
        category: 'performance',
        severity: 'hint',
        title: 'Large inline <style> block',
        description:
            'Inline styles above ~14KB hurt LCP. Consider extracting non-critical CSS.',
        aiPromptHint: 'Extract non-critical CSS into an external stylesheet loaded with rel="preload".'
    },
    MISSING_VIEWPORT: {
        id: 'missing-viewport',
        category: 'performance',
        severity: 'warning',
        title: 'Missing viewport meta tag',
        description: 'Required for responsive rendering and mobile Core Web Vitals.',
        aiPromptHint:
            'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the head.'
    },
    MISSING_CHARSET: {
        id: 'missing-charset',
        category: 'performance',
        severity: 'info',
        title: 'Missing charset meta tag',
        description: 'Add <meta charset="UTF-8"> as the first child of <head>.',
        aiPromptHint: 'Add <meta charset="UTF-8"> as the first child of <head>.'
    }
} satisfies IssueMap;

export type IssueKey = keyof typeof ISSUES;
