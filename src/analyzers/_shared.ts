import * as vscode from 'vscode';
import { Issue, IssueDef, IssueSeverityName } from '../types';

export function rangeFor(document: vscode.TextDocument, start: number, end: number): vscode.Range {
    return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

export function severityFor(name: IssueSeverityName | string): vscode.DiagnosticSeverity {
    switch (name) {
        case 'error': return vscode.DiagnosticSeverity.Error;
        case 'warning': return vscode.DiagnosticSeverity.Warning;
        case 'info': return vscode.DiagnosticSeverity.Information;
        default: return vscode.DiagnosticSeverity.Hint;
    }
}

export interface PushExtra {
    message?: string;
    context?: Record<string, unknown>;
}

export function push(out: Issue[], issueDef: IssueDef, range: vscode.Range, extra: PushExtra = {}): void {
    out.push({
        code: issueDef.id,
        category: issueDef.category,
        title: issueDef.title,
        message: extra.message || `${issueDef.title}: ${issueDef.description}`,
        severity: severityFor(issueDef.severity),
        range,
        fixable: true,
        context: extra.context || {}
    });
}
