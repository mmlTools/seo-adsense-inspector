import * as vscode from 'vscode';
import { selectModel, streamRequest } from './aiFixer';
import { extractMainContent } from '../utils/htmlUtils';

export interface AiWrittenResult {
    /** 0-100 likelihood the content was AI-written. */
    score: number;
    /** Short reasoning the model produced. */
    reason: string;
}

/**
 * Ask the language model to estimate the probability that the visible prose
 * in `document` was written by an AI. Returns null when no model is available.
 */
export async function detectAiWritten(
    document: vscode.TextDocument,
    token?: vscode.CancellationToken
): Promise<AiWrittenResult | null> {
    if (!vscode.lm || typeof vscode.lm.selectChatModels !== 'function') return null;
    const model = await selectModel();
    if (!model) return null;

    const raw = document.getText();
    const text = document.languageId === 'markdown'
        ? raw
        : extractMainContent(raw);

    const sample = text.length > 6000 ? text.slice(0, 6000) + '\n...(truncated)' : text;
    if (sample.trim().length < 80) {
        return { score: 0, reason: 'Not enough text to analyze.' };
    }

    const prompt =
        'You are an AI-content detector. Estimate the probability (0-100) that the following text was generated or heavily assisted by a large language model, based on stylistic markers: ' +
        'uniform sentence length, hedging phrases ("it is important to note"), bulleted listicle structure, lack of specific named anecdotes, generic transitions, repetitive scaffolding, and absence of idiosyncratic voice. ' +
        'Output STRICT JSON with this exact shape and nothing else:\n' +
        '{ "score": <integer 0-100>, "reason": "<one short sentence>" }\n\n' +
        '--- TEXT ---\n' + sample + '\n--- END TEXT ---\n\n' +
        'Respond with raw JSON only.';

    const messages = [vscode.LanguageModelChatMessage.User(prompt)];
    const cts = token ? undefined : new vscode.CancellationTokenSource();
    const useToken = token ?? cts!.token;

    let response: string;
    try {
        response = await streamRequest(model, messages, useToken);
    } finally {
        cts?.dispose();
    }

    let clean = response.trim();
    const fence = clean.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
    if (fence) clean = fence[1];

    try {
        const parsed = JSON.parse(clean) as Partial<AiWrittenResult>;
        const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
        const reason = typeof parsed.reason === 'string' ? parsed.reason : '';
        return { score, reason };
    } catch {
        return { score: 0, reason: 'Could not parse model response.' };
    }
}
