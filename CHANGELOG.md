# Changelog

## 1.0.4

- **Export report as PDF**: new 📄 *Export PDF* button in the AdSense Review panel. Saves a self-contained, print-styled HTML report and offers to open it in your browser, where the print dialog auto-opens so you can choose **Save as PDF**. The export captures the readiness score, issue breakdown by category, and the AI reviewer verdict (if generated).

## 1.0.3

- Migrated the codebase from JavaScript to TypeScript; the published build now compiles from `src/` to `out/`.
- **AI-Written Likelihood detector**: new `SEO/AdSense: Detect AI-Written Likelihood` command that asks the language model to score the visible prose 0–100 with a short rationale. Result is cached per file version.
- **SEO score status bar item** (0–100) with pass / warning / error icon, alongside the existing issue counter. Click either to open the report panel.
- **AI-written %** status bar indicator that appears after running the detector.
- Centralized scoring in `analyzers/score.ts` so the status bar and the review panel agree on the same number.
- Editor title-bar buttons for **Show Report** and **Detect AI-Written Likelihood** on supported file types.

## 1.0.2

- `SEO/AdSense: Fix All Issues with AI` command: iterates every diagnostic in the active file, asking for confirmation before each edit.
- Per-document debounced auto-scan on edit (configurable via `seoAdsense.enableAutoScan`).
- Cleanup of diagnostics and cached results when a document is closed.

## 1.0.1

- Expanded supported languages to include Vue and Svelte alongside HTML, PHP, JSX/TSX, and Markdown.
- Added context-menu and editor-title entry points for `Scan Current File`, `Simulate Google AdSense Review`, and `Show Report`.
- Marketplace metadata polish: icon, gallery banner, keywords, sponsor link.

## 1.0.0 — Initial release

- Static analyzers for SEO, AdSense compliance, schema, content quality, and Core Web Vitals
- Inline diagnostics on HTML, PHP, JSX/TSX, Vue, Svelte, Markdown
- Code action provider with deterministic quick-fixes and **✨ Fix with AI** for every issue
- "Simulate Google AdSense Review" WebView panel with LLM-generated verdict
- Workspace-wide scan command
- Status bar issue counter
- Zero runtime dependencies
