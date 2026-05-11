# SEO + AdSense Compliance Inspector

A VS Code extension that statically scans HTML, PHP/CodeIgniter 4, React/JSX, Vue, Svelte, and Markdown files for SEO problems, Google AdSense policy risks, structured-data gaps, and Core Web Vitals issues — and optionally uses VS Code's Language Model API (e.g. GitHub Copilot Chat) to suggest one-click fixes, simulate an AdSense reviewer, and estimate how AI-written your prose looks.

Static analysis runs locally with **zero runtime dependencies** and **no telemetry**. AI features are entirely optional and only activate when you trigger them.

## What it actually does

### 1. Static analyzers (always on, no AI required)

Issues appear as inline squiggles and in the **Problems** panel. Severity ranges from error → warning → info.

| Category | Examples of what's flagged |
|---|---|
| **SEO** | Missing / too-short / too-long `<title>`, missing meta description, missing or malformed canonical, missing or multiple `<h1>`, skipped heading levels, missing `alt` on `<img>`, too few internal links, missing viewport / charset meta |
| **Content quality** | Word count under the "thin content" threshold, very thin pages (< 200 words) |
| **AdSense policy risk** | Missing Privacy Policy / About / Contact links, ads above the first paragraph of real content, ads next to navigation, excessive ad density, auto-ads on near-empty pages, duplicate AdSense loader scripts, keyword hits against a list of high-risk topics |
| **Structured data** | Missing JSON-LD, invalid JSON-LD, missing `@context` or `@type` |
| **Core Web Vitals** | `<img>` without `width` / `height` (CLS), images missing `loading="lazy"`, render-blocking `<script>` in `<head>`, oversized inline `<style>` |

The analyzers operate on the source text using targeted regex (see [Why no runtime dependencies](#why-no-runtime-dependencies)). They run on open, save, and — if `seoAdsense.enableAutoScan` is on — debounced on edit.

### 2. Status bar indicators

When a supported file is active, three items appear on the right of the status bar:

- **SEO score** (0–100) with pass / warning / error icon. Click to open the report panel.
- **AI-written %** after you run the AI-written detection on the file (cached per file version).
- **Issue counter** showing `errors✗ warnings⚠`. Click to open the report panel.

### 3. AI features (require a VS Code Language Model provider)

These all go through `vscode.lm` — typically powered by **GitHub Copilot Chat**. If no model is available, the AI features quietly disable themselves and static analysis keeps working. The extension never asks for an API key.

- **✨ Fix with AI** — Lightbulb action on every diagnostic. The model generates a targeted fix, which is shown for confirmation before being applied.
- **Fix All Issues with AI** — Walks through every diagnostic in the active file in sequence, asking for confirmation on each.
- **Simulate Google AdSense Review** — Opens a WebView panel with the readiness score, issue breakdown by category, and a structured LLM-generated verdict (strengths, concerns, action items, and specific policy risks). This is a heuristic simulation, **not an official Google review**.
- **Export report as PDF** — The review panel has an *Export PDF* button that saves a self-contained, print-styled HTML report and opens it in your browser. The browser print dialog launches automatically so you can pick **Save as PDF** as the destination.
- **Detect AI-Written Likelihood** — Sends the visible prose (with HTML/templating stripped) to the model and returns a 0–100 score plus a one-sentence reason. The result is cached and shown in the status bar.

## Commands

All commands are available from the Command Palette under the **SEO/AdSense** category. Some also appear in the editor title bar and right-click menu on supported file types.

| Command | What it does |
|---|---|
| `SEO/AdSense: Scan Current File` | Re-runs the static analyzers on the active file |
| `SEO/AdSense: Scan Entire Workspace` | Scans every supported file in the workspace |
| `SEO/AdSense: Show Report for Current File` | Opens the report / review WebView |
| `SEO/AdSense: Simulate Google AdSense Review` | Same panel, but also asks the LLM for a reviewer verdict |
| `SEO/AdSense: Fix All Issues with AI` | Iterates through every diagnostic with AI fixes |
| `SEO/AdSense: Detect AI-Written Likelihood` | Estimates how AI-generated the prose looks |

Supported languages: `html`, `php`, `javascriptreact`, `typescriptreact`, `vue`, `svelte`, `markdown`.

## Configuration

Open Settings → search **"SEO/AdSense"**:

| Setting | Default | Purpose |
|---|---|---|
| `seoAdsense.minWordCount` | `300` | Threshold below which content is flagged as thin |
| `seoAdsense.recommendedWordCount` | `800` | Recommended depth for full articles |
| `seoAdsense.minInternalLinks` | `2` | Minimum recommended internal links per page |
| `seoAdsense.metaDescriptionMin` / `Max` | `120` / `160` | Meta description length window |
| `seoAdsense.titleMin` / `titleMax` | `30` / `60` | `<title>` length window |
| `seoAdsense.enableAutoScan` | `true` | Re-scan on edit (debounced) in addition to open/save |
| `seoAdsense.languageModel` | `auto` | Preferred model: `auto`, `copilot-gpt-4o`, `copilot-gpt-4`, `copilot-claude-3.5-sonnet` |
| `seoAdsense.checkAdSensePolicy` | `true` | Toggle AdSense policy checks |
| `seoAdsense.checkSchema` | `true` | Toggle JSON-LD / schema checks |
| `seoAdsense.checkCWV` | `true` | Toggle Core Web Vitals checks |

## Install

### From the Marketplace

Search **"SEO AdSense Compliance Inspector"** (publisher `MMLTECH`) in the Extensions view.

### From source

```bash
git clone https://github.com/mmlTools/seo-adsense-inspector.git
cd seo-adsense-inspector
npm install
npm run compile
# Open in VS Code and press F5 to launch the Extension Development Host
```

### Package locally

```bash
npm install
npm run package   # uses @vscode/vsce to produce a .vsix
code --install-extension seo-adsense-inspector-*.vsix
```

## Project structure

The extension is written in TypeScript and compiled to `out/`.

```
seo-adsense-inspector/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts                       # Activation, commands, diagnostics, status bar
│   ├── types.ts
│   ├── analyzers/
│   │   ├── index.ts                       # Orchestrates all analyzers
│   │   ├── issues.ts                      # Issue codes, severities, fix prompts
│   │   ├── score.ts                       # 0-100 readiness score
│   │   ├── seoAnalyzer.ts
│   │   ├── contentAnalyzer.ts
│   │   ├── adsenseAnalyzer.ts
│   │   ├── schemaAnalyzer.ts
│   │   └── performanceAnalyzer.ts
│   ├── llm/
│   │   ├── aiFixer.ts                     # vscode.lm: per-issue and "fix all" flows
│   │   └── aiWrittenDetector.ts           # AI-written-likelihood scoring
│   ├── providers/
│   │   └── codeActionProvider.ts          # Lightbulb code actions
│   ├── views/
│   │   └── adsenseReviewPanel.ts          # The review / report WebView
│   └── utils/
│       └── htmlUtils.ts                   # Regex-based HTML extraction
└── samples/
    └── test.html
```

## Why no runtime dependencies

The extension ships zero runtime npm packages. HTML is parsed with targeted regex because:

1. We only need approximate locations and the visible-text content, not a real DOM.
2. Source files often contain templating noise (PHP, JSX, Liquid, Twig) that defeats real HTML parsers.
3. It keeps the bundle tiny, the supply-chain surface minimal, and activation fast.

The trade-off: pathological or unusual markup can produce false positives. Issue reports welcome.

(`npm install` is only required to build from source — TypeScript and `@vscode/vsce` are `devDependencies`.)

## Privacy

- Static analysis runs entirely locally. Nothing leaves your machine.
- AI features send the relevant snippet (and, for the AI-written detector, up to ~6 KB of visible prose) to whichever model provider you have configured in VS Code. The extension itself collects no telemetry.

## Known limitations

- The **Simulate AdSense Review** verdict is an LLM simulation, **not** an official Google decision.
- Prohibited-content detection is keyword-based and will produce false positives on legitimate writing about restricted topics.
- The extension analyzes one file at a time. Site-wide concerns (cross-page duplication, sitemap, `robots.txt`, server response headers) are out of scope.
- AI-written likelihood is a stylistic heuristic from an LLM — treat it as a smell test, not a verdict.

## Contributing

Issues and pull requests are welcome at <https://github.com/mmlTools/seo-adsense-inspector>.

## License

MIT
