import * as vscode from 'vscode';
import { analyzeDocument } from '../analyzers';
import { selectModel, streamRequest } from '../llm/aiFixer';
import { extractMainContent, wordCount } from '../utils/htmlUtils';
import { Issue } from '../types';

let currentPanel: vscode.WebviewPanel | null = null;

interface ReportData {
    fileName: string;
    languageId: string;
    wordCount: number;
    score: number;
    verdict: string;
    errors: number;
    warnings: number;
    infos: number;
    byCategory: Record<string, Issue[]>;
    issues: Issue[];
}

interface LLMVerdict {
    verdict?: string;
    summary?: string;
    strengths?: string[];
    concerns?: string[];
    actionItems?: string[];
    policyRisks?: string[];
    unavailable?: string;
    error?: string;
    raw?: string;
    parseError?: string;
}

/**
 * Open the "Simulate Google AdSense Review" panel for a document.
 */
export async function openAdSenseReviewPanel(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument
): Promise<void> {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
            'seoAdsenseReview',
            'AdSense Review Simulation',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        currentPanel.onDidDispose(() => { currentPanel = null; }, null, context.subscriptions);

        currentPanel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'rerun') {
                await runReview(document);
            } else if (msg.type === 'jumpToIssue') {
                const editor = await vscode.window.showTextDocument(document, {
                    viewColumn: vscode.ViewColumn.One,
                    preserveFocus: false
                });
                const range = new vscode.Range(msg.line, msg.column, msg.line, msg.column + 1);
                editor.selection = new vscode.Selection(range.start, range.end);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            } else if (msg.type === 'openSettings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'seoAdsense');
            }
        });
    }

    await runReview(document);
}

async function runReview(document: vscode.TextDocument): Promise<void> {
    if (!currentPanel) return;

    currentPanel.webview.html = renderLoading(document.fileName);

    const issues = analyzeDocument(document);
    const source = document.getText();
    const text = extractMainContent(source);
    const words = wordCount(text);

    const report = buildReport(issues, document, words);

    currentPanel.webview.html = renderReport(report, null, document.fileName);

    try {
        const verdict = await generateLLMVerdict(document, report);
        if (currentPanel) {
            currentPanel.webview.html = renderReport(report, verdict, document.fileName);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (currentPanel) {
            currentPanel.webview.html = renderReport(report, { error: msg }, document.fileName);
        }
    }
}

function buildReport(issues: Issue[], document: vscode.TextDocument, words: number): ReportData {
    const byCategory: Record<string, Issue[]> = { seo: [], adsense: [], content: [], schema: [], performance: [] };
    for (const issue of issues) {
        const cat = issue.category || 'seo';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(issue);
    }

    const errors = issues.filter(i => i.severity === vscode.DiagnosticSeverity.Error).length;
    const warnings = issues.filter(i => i.severity === vscode.DiagnosticSeverity.Warning).length;
    const infos = issues.filter(i => i.severity === vscode.DiagnosticSeverity.Information).length;

    let score = 100;
    score -= errors * 20;
    score -= warnings * 7;
    score -= infos * 2;
    if (words < 200) score -= 25;
    else if (words < 500) score -= 10;
    score = Math.max(0, Math.min(100, score));

    let verdict: string;
    if (errors > 0) verdict = 'Likely rejected';
    else if (warnings >= 4) verdict = 'High risk of rejection';
    else if (warnings >= 1) verdict = 'Borderline — fix warnings first';
    else if (score >= 90) verdict = 'Likely approved';
    else verdict = 'Approved with minor concerns';

    return {
        fileName: document.fileName,
        languageId: document.languageId,
        wordCount: words,
        score,
        verdict,
        errors,
        warnings,
        infos,
        byCategory,
        issues
    };
}

async function generateLLMVerdict(document: vscode.TextDocument, report: ReportData): Promise<LLMVerdict> {
    if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') {
        return { unavailable: 'VS Code Language Model API not available.' };
    }
    const model = await selectModel();
    if (!model) {
        return { unavailable: 'No language model installed. Install GitHub Copilot Chat to enable the AI verdict.' };
    }

    const source = document.getText();
    const truncated = source.length > 8000 ? source.slice(0, 8000) + '\n...(truncated)' : source;

    const issueSummary = report.issues
        .slice(0, 25)
        .map(i => `- [${severityLabel(i.severity)}] ${i.code}: ${i.message}`)
        .join('\n') || '(no static issues detected)';

    const prompt =
        'You are roleplaying as a Google AdSense reviewer evaluating a single page for monetization eligibility. ' +
        'Be realistic, specific, and slightly stern — like an actual policy reviewer. ' +
        'Base your response strictly on the supplied content and static-analysis findings; do not invent facts about the broader site. ' +
        'Output STRICT JSON with this exact shape and nothing else:\n' +
        '{\n' +
        '  "verdict": "approved" | "approved-with-concerns" | "needs-work" | "likely-rejected",\n' +
        '  "summary": "1-2 sentence overall judgment",\n' +
        '  "strengths": ["..."],\n' +
        '  "concerns": ["..."],\n' +
        '  "actionItems": ["concrete fix 1", "concrete fix 2", "..."],\n' +
        '  "policyRisks": ["specific AdSense policy references, e.g. \'Valuable Inventory: Scaled content\'"]\n' +
        '}\n\n' +
        `File: ${document.fileName}\n` +
        `Language: ${document.languageId}\n` +
        `Word count: ${report.wordCount}\n` +
        `Static analysis (${report.issues.length} issues):\n${issueSummary}\n\n` +
        `--- PAGE SOURCE ---\n${truncated}\n--- END PAGE SOURCE ---\n\n` +
        'Respond with raw JSON only. No code fences, no preamble.';

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const text = await streamRequest(model, messages, new vscode.CancellationTokenSource().token);

    let clean = text.trim();
    const fence = clean.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
    if (fence) clean = fence[1];

    try {
        return JSON.parse(clean) as LLMVerdict;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { raw: clean, parseError: msg };
    }
}

function severityLabel(s: vscode.DiagnosticSeverity): string {
    switch (s) {
        case vscode.DiagnosticSeverity.Error: return 'ERROR';
        case vscode.DiagnosticSeverity.Warning: return 'WARN';
        case vscode.DiagnosticSeverity.Information: return 'INFO';
        default: return 'HINT';
    }
}

// --- Rendering ---

function renderLoading(fileName: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">${baseStyles()}</head>
<body>
  <div class="container">
    <h1>AdSense Review Simulation</h1>
    <p class="muted">${escape(basename(fileName))}</p>
    <div class="card">
      <p>Running static analysis…</p>
      <div class="spinner"></div>
    </div>
  </div>
</body></html>`;
}

function renderReport(report: ReportData, llmVerdict: LLMVerdict | null, fileName: string): string {
    const scoreColor =
        report.score >= 85 ? 'var(--green)' :
        report.score >= 65 ? 'var(--yellow)' :
        'var(--red)';

    const llmSection = llmVerdict
        ? renderLLMVerdict(llmVerdict)
        : '<div class="card"><p class="muted">Asking AI reviewer for a verdict…</p><div class="spinner"></div></div>';

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">${baseStyles()}</head>
<body>
<div class="container">
  <header class="hero">
    <div>
      <div class="eyebrow">SIMULATED ADSENSE REVIEW</div>
      <h1>${escape(basename(fileName))}</h1>
      <p class="muted">${report.wordCount} words · ${report.issues.length} issues found</p>
    </div>
    <div class="score-block">
      <div class="score" style="color:${scoreColor}">${report.score}</div>
      <div class="score-label">Readiness</div>
    </div>
  </header>

  <div class="verdict-row">
    <div class="verdict-pill ${verdictClass(report.verdict)}">${escape(report.verdict)}</div>
    <button class="btn" data-action="rerun">↻ Re-run</button>
    <button class="btn" data-action="openSettings">⚙ Settings</button>
  </div>

  <div class="grid">
    <div class="stat-card stat-error">
      <div class="stat-num">${report.errors}</div>
      <div class="stat-label">Errors</div>
    </div>
    <div class="stat-card stat-warn">
      <div class="stat-num">${report.warnings}</div>
      <div class="stat-label">Warnings</div>
    </div>
    <div class="stat-card stat-info">
      <div class="stat-num">${report.infos}</div>
      <div class="stat-label">Info</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${report.wordCount}</div>
      <div class="stat-label">Words</div>
    </div>
  </div>

  <section>
    <h2>AI Reviewer Verdict</h2>
    ${llmSection}
  </section>

  ${renderCategorySection('AdSense Compliance', report.byCategory.adsense, '🛡️')}
  ${renderCategorySection('Content Quality', report.byCategory.content, '📝')}
  ${renderCategorySection('SEO', report.byCategory.seo, '🔍')}
  ${renderCategorySection('Schema / Structured Data', report.byCategory.schema, '🧩')}
  ${renderCategorySection('Performance / Core Web Vitals', report.byCategory.performance, '⚡')}

  <footer>
    <p class="muted">This is a heuristic simulation, not an official Google review.</p>
  </footer>
</div>

<script>
  const vscode = window.__vscodeApi || (window.__vscodeApi = acquireVsCodeApi());
  document.querySelectorAll('[data-jump]').forEach(el => {
    el.addEventListener('click', () => {
      const [line, col] = el.dataset.jump.split(',').map(Number);
      vscode.postMessage({ type: 'jumpToIssue', line, column: col });
    });
  });
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      vscode.postMessage({ type: el.dataset.action });
    });
  });
</script>
</body></html>`;
}

function renderCategorySection(title: string, issues: Issue[] | undefined, emoji: string): string {
    if (!issues || issues.length === 0) {
        return `
        <section>
          <h2>${emoji} ${title}</h2>
          <div class="card pass"><span class="check">✓</span> No issues detected.</div>
        </section>`;
    }
    const items = issues.map(i => `
      <li class="issue issue-${severityClass(i.severity)}" data-jump="${i.range.start.line},${i.range.start.character}">
        <div class="issue-head">
          <span class="badge badge-${severityClass(i.severity)}">${severityLabel(i.severity)}</span>
          <span class="issue-code">${escape(i.code)}</span>
          <span class="issue-loc">line ${i.range.start.line + 1}</span>
        </div>
        <div class="issue-msg">${escape(i.message)}</div>
      </li>
    `).join('');
    return `
    <section>
      <h2>${emoji} ${title} <span class="count">${issues.length}</span></h2>
      <ul class="issue-list">${items}</ul>
    </section>`;
}

function renderLLMVerdict(v: LLMVerdict): string {
    if (v.unavailable) {
        return `<div class="card warn"><strong>AI verdict unavailable.</strong><br>${escape(v.unavailable)}</div>`;
    }
    if (v.error) {
        return `<div class="card warn"><strong>AI verdict failed:</strong> ${escape(v.error)}</div>`;
    }
    if (v.parseError) {
        return `<div class="card warn"><strong>AI returned non-JSON response:</strong><pre>${escape(v.raw || '')}</pre></div>`;
    }

    const list = (arr: string[] | undefined, cls: string) => arr && arr.length
        ? `<ul class="${cls}">${arr.map(x => `<li>${escape(x)}</li>`).join('')}</ul>`
        : '<p class="muted">(none)</p>';

    return `
    <div class="card verdict-card">
      <div class="verdict-pill ${verdictClass(v.verdict || '')}">${escape(v.verdict || 'unknown')}</div>
      <p class="summary">${escape(v.summary || '')}</p>
      <div class="verdict-cols">
        <div>
          <h4>Strengths</h4>
          ${list(v.strengths, 'pros')}
        </div>
        <div>
          <h4>Concerns</h4>
          ${list(v.concerns, 'cons')}
        </div>
      </div>
      <h4>Action Items</h4>
      ${list(v.actionItems, 'actions')}
      ${v.policyRisks && v.policyRisks.length ? `<h4>Policy Risks</h4>${list(v.policyRisks, 'policies')}` : ''}
    </div>`;
}

function verdictClass(v: string): string {
    const s = String(v).toLowerCase();
    if (s.includes('reject')) return 'pill-red';
    if (s.includes('needs-work') || s.includes('high risk') || s.includes('borderline')) return 'pill-yellow';
    if (s.includes('concern')) return 'pill-yellow';
    if (s.includes('approved') || s.includes('likely approved')) return 'pill-green';
    return 'pill-neutral';
}

function severityClass(s: vscode.DiagnosticSeverity): string {
    switch (s) {
        case vscode.DiagnosticSeverity.Error: return 'error';
        case vscode.DiagnosticSeverity.Warning: return 'warn';
        case vscode.DiagnosticSeverity.Information: return 'info';
        default: return 'hint';
    }
}

function escape(s: unknown): string {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function basename(p: string): string {
    return String(p).split(/[\\/]/).pop() || '';
}

function baseStyles(): string {
    return `<style>
:root {
  --green: #16a34a;
  --yellow: #d97706;
  --red: #dc2626;
}
* { box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  margin: 0;
  padding: 0;
  line-height: 1.5;
}
.container {
  max-width: 920px;
  margin: 0 auto;
  padding: 24px;
}
.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vscode-panel-border);
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
}
h1 { font-size: 22px; margin: 0 0 4px 0; }
h2 {
  font-size: 16px;
  margin-top: 32px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
h4 { margin: 16px 0 6px 0; font-size: 13px; }
.muted { color: var(--vscode-descriptionForeground); }
.score-block { text-align: right; }
.score { font-size: 56px; font-weight: 700; line-height: 1; }
.score-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--vscode-descriptionForeground); }
.verdict-row { display: flex; gap: 8px; align-items: center; margin: 12px 0 24px 0; }
.verdict-pill {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.pill-green { background: rgba(22, 163, 74, 0.15); color: var(--green); }
.pill-yellow { background: rgba(217, 119, 6, 0.15); color: var(--yellow); }
.pill-red { background: rgba(220, 38, 38, 0.15); color: var(--red); }
.pill-neutral { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.btn {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-panel-border);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.stat-card {
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border);
  padding: 16px;
  border-radius: 6px;
  text-align: center;
}
.stat-num { font-size: 28px; font-weight: 700; }
.stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--vscode-descriptionForeground); }
.stat-error .stat-num { color: var(--red); }
.stat-warn .stat-num { color: var(--yellow); }
.stat-info .stat-num { color: var(--vscode-textLink-foreground); }
.card {
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border);
  padding: 16px;
  border-radius: 6px;
  margin-bottom: 12px;
}
.card.pass { border-color: var(--green); }
.card.warn { border-color: var(--yellow); }
.card .check { color: var(--green); font-weight: 700; margin-right: 6px; }
.verdict-card .summary { font-size: 14px; margin: 12px 0; }
.verdict-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.verdict-cols ul, .actions, .policies { margin: 0; padding-left: 18px; }
.pros li { color: var(--green); }
.cons li { color: var(--yellow); }
.count {
  font-size: 11px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.issue-list { list-style: none; padding: 0; margin: 0; }
.issue {
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-panel-border);
  border-left-width: 3px;
  padding: 10px 14px;
  border-radius: 4px;
  margin-bottom: 6px;
  cursor: pointer;
}
.issue:hover { background: var(--vscode-list-hoverBackground); }
.issue-error { border-left-color: var(--red); }
.issue-warn { border-left-color: var(--yellow); }
.issue-info { border-left-color: var(--vscode-textLink-foreground); }
.issue-hint { border-left-color: var(--vscode-descriptionForeground); }
.issue-head { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.issue-msg { margin-top: 4px; font-size: 13px; }
.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 3px;
  letter-spacing: 0.05em;
}
.badge-error { background: var(--red); color: white; }
.badge-warn { background: var(--yellow); color: white; }
.badge-info { background: var(--vscode-textLink-foreground); color: white; }
.badge-hint { background: var(--vscode-descriptionForeground); color: var(--vscode-editor-background); }
.issue-code { font-family: var(--vscode-editor-font-family); color: var(--vscode-descriptionForeground); }
.issue-loc { margin-left: auto; color: var(--vscode-descriptionForeground); }
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--vscode-panel-border);
  border-top-color: var(--vscode-textLink-foreground);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-top: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }
footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--vscode-panel-border); text-align: center; }
pre {
  background: var(--vscode-textBlockQuote-background);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
}
</style>`;
}
