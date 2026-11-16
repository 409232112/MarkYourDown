/**
 * Shared KaTeX Configuration (Chapter 3, Chapter 9.1)
 * Used by both the live editor and the export pipeline.
 */

export interface KatexOptions {
  displayMode?: boolean;
  output?: 'html' | 'mathml' | 'htmlAndMathml';
  leqno?: boolean;
  fleqn?: boolean;
  throwOnError?: boolean;
  errorColor?: string;
  macros?: Record<string, string>;
  minRuleThickness?: number;
  colorIsTextColor?: boolean;
  maxSize?: number;
  maxExpand?: number;
  strict?: boolean | string | ((errorCode: string, errorMsg: string, token: unknown) => string | boolean);
  trust?: boolean | ((context: { command: string; url: string; protocol: string }) => boolean);
  globalGroup?: boolean;
}

export const sharedKatexOptions: KatexOptions = {
  throwOnError: false,
  errorColor: '#cc0000',
  strict: 'warn',
  output: 'htmlAndMathml',
  trust: false,
  macros: {
    '\\R': '\\mathbb{R}',
    '\\N': '\\mathbb{N}',
    '\\Z': '\\mathbb{Z}',
    '\\C': '\\mathbb{C}',
    '\\Q': '\\mathbb{Q}',
  },
};
