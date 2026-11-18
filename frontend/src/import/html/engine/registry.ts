import type { Element, Nodes } from 'hast';
import type { HtmlReference, Issue } from '../contracts';
export interface RuleContext { issue(issue: Omit<Issue, 'ruleId' | 'ruleVersion'>, node: Element): void; reference(kind: 'image' | 'link', original: string): string; text(node: Nodes): string }
export interface Rule { id: string; version: number; priority: number; match(node: Element): boolean; apply(node: Element, ctx: RuleContext): Element | null | undefined }
export function registry(rules: Rule[]): Rule[] { const ids = new Set<string>(); for (const r of rules) { if (ids.has(r.id)) throw new Error(`Duplicate rule: ${r.id}`); ids.add(r.id); } return [...rules].sort((a,b) => b.priority-a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); }
