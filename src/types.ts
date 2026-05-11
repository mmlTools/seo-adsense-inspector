import * as vscode from 'vscode';

export type IssueCategory = 'seo' | 'adsense' | 'schema' | 'performance' | 'content';
export type IssueSeverityName = 'error' | 'warning' | 'info' | 'hint';

export interface IssueDef {
    id: string;
    category: IssueCategory;
    severity: IssueSeverityName;
    title: string;
    description: string;
    aiPromptHint: string;
}

export interface Issue {
    code: string;
    category: IssueCategory;
    title: string;
    message: string;
    severity: vscode.DiagnosticSeverity;
    range: vscode.Range;
    fixable: boolean;
    context: Record<string, unknown>;
}

export interface RegexMatch {
    match: RegExpExecArray;
    start: number;
    end: number;
}
