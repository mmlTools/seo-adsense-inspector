# SEO + AdSense Compliance Inspector

AI-powered VS Code extension that scans HTML, PHP/CodeIgniter 4, React/JSX, Vue, Svelte, and Markdown files for SEO problems, AdSense policy risks, schema gaps, and Core Web Vitals issues — then fixes them with one click using the VS Code Language Model API.

## Features

### Static analysis (no AI needed)

| Category | What it catches |
|---|---|
| **SEO** | Missing/short/long `<title>`, missing meta description, missing canonical, bad canonical href, missing H1, multiple H1s, skipped heading levels, missing `alt` on images, no/few internal links, missing viewport/charset meta |
| **AdSense compliance** | Thin content (< 300 words), very thin content (< 200 words), missing Privacy Policy / About / Contact links, ads placed near navigation, ads above any real content, excessive ad density, auto-ads enabled on near-empty pages, duplicate AdSense scripts, prohibited content phrases |
| **Schema / structured data** | Missing JSON-LD, invalid JSON-LD, missing `@context`, missing `@type` |
| **Core Web Vitals** | Images without `width`/`height` (CLS risk), missing `loading="lazy"`, render-blocking `<script>` in head, oversized inline `<style>` |

### AI features (require GitHub Copilot Chat or another VS Code Language Model provider)

1. **Fix with AI** — Lightbulb action on every diagnostic. Generates a targeted fix and shows it for confirmation before applying.
2. **Simulate Google AdSense Review** — Opens a side panel that:
   - Computes a readiness score (0–100)
   - Breaks down issues by category
   - Asks an LLM to play the role of a Google reviewer and return a structured verdict with strengths, concerns, action items, and specific AdSense policy risks
3. **Fix All with AI** — Walk through every issue in the active file in sequence.

## Installation

### From source (development)

```bash
git clone <this repo>
cd seo-adsense-inspector
# No npm install needed — zero runtime dependencies
code .
# Press F5 in VS Code to launch an Extension Development Host
```

### Packaging

```bash
npm install -g @vscode/vsce
vsce package
# Produces seo-adsense-inspector-1.0.0.vsix
code --install-extension seo-adsense-inspector-1.0.0.vsix
```

## Usage

1. Open any HTML, PHP, JSX/TSX, Vue, Svelte, or Markdown file.
2. Issues appear in the **Problems** panel and as inline squiggles.
3. Click the lightbulb next to any issue → **✨ Fix "<code>" with AI**.
4. Run **SEO/AdSense: Simulate Google AdSense Review** (Command Palette or right-click menu) for the full simulated review.

The status bar shows a live issue count for the active file — click it to open the review panel.

## Commands

| Command | What it does |
|---|---|
| `SEO/AdSense: Scan Current File` | Re-run analyzers on the active file |
| `SEO/AdSense: Scan Entire Workspace` | Scan every supported file in the workspace |
| `SEO/AdSense: Simulate Google AdSense Review` | Open the AI-powered review panel |
| `SEO/AdSense: Fix All Issues with AI` | Walk through every issue and fix each |
| `SEO/AdSense: Show Report for Current File` | Same as the review panel |

## Configuration

Open Settings → search "SEO/AdSense":

- `seoAdsense.minWordCount` (default 300) — Threshold below which content is flagged as thin
- `seoAdsense.recommendedWordCount` (default 800)
- `seoAdsense.minInternalLinks` (default 2)
- `seoAdsense.metaDescriptionMin` / `metaDescriptionMax` (120 / 160)
- `seoAdsense.titleMin` / `titleMax` (30 / 60)
- `seoAdsense.enableAutoScan` (default true) — Scan on every edit (debounced)
- `seoAdsense.languageModel` — `auto`, `copilot-claude-3.5-sonnet`, `copilot-gpt-4o`, `copilot-gpt-4`
- `seoAdsense.checkAdSensePolicy` / `checkSchema` / `checkCWV` — toggle category groups

## How the AI integration works

This extension uses [VS Code's Language Model API](https://code.visualstudio.com/api/extension-guides/language-model) (`vscode.lm`) — the official, in-editor way to invoke chat models. It works with any model registered by an installed extension. In practice this means:

- **GitHub Copilot Chat** installed → access to Claude, GPT-4o, GPT-4, etc.
- No Copilot Chat → AI features are disabled with a clear prompt to install it. Static analysis still works.

Requests are made via `vscode.lm.selectChatModels` and `model.sendRequest`. The extension never asks the user for an API key — billing goes through whichever model provider the user has set up in VS Code.

## Project structure

```
seo-adsense-inspector/
├── package.json
├── extension.js                          # Activation, commands, diagnostics
├── src/
│   ├── analyzers/
│   │   ├── index.js                      # Runs every analyzer
│   │   ├── issues.js                     # Issue registry (codes, severities, prompts)
│   │   ├── seoAnalyzer.js                # Title, meta, headings, canonical, links, alt
│   │   ├── contentAnalyzer.js            # Word count / thin content
│   │   ├── adsenseAnalyzer.js            # Ad placement, density, required pages
│   │   ├── schemaAnalyzer.js             # JSON-LD validation
│   │   └── performanceAnalyzer.js        # CLS, render-blocking, lazy loading
│   ├── llm/
│   │   └── aiFixer.js                    # vscode.lm integration
│   ├── providers/
│   │   └── codeActionProvider.js         # Lightbulb fixes (AI + deterministic)
│   ├── views/
│   │   └── adsenseReviewPanel.js         # The "Simulate Review" WebView
│   └── utils/
│       └── htmlUtils.js                  # Lightweight regex-based HTML parsing
└── README.md
```

## Why no dependencies?

The extension uses zero runtime npm packages. HTML parsing is done via targeted regex because:

1. We only need approximate locations + content, not a real DOM.
2. The user is editing **source** that often contains templating noise (PHP, JSX, Liquid) which trips up real HTML parsers.
3. Smaller bundle, no supply-chain surface, faster activation.

The trade-off is that pathological HTML can produce false positives. Reports welcome.

## Known limitations

- The "Simulate AdSense Review" verdict from the LLM is a heuristic simulation, **not an official Google review**.
- Prohibited-content detection is keyword-based and will produce false positives on legitimate writing about restricted topics.
- The extension analyzes one file at a time; site-wide concerns (duplicate content across pages, sitemap presence, robots.txt) are out of scope.

## License

MIT
