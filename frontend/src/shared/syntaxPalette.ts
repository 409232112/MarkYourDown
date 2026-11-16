/**
 * Single source of truth for Code Highlighting Palette (Chapter 7.4)
 * Generates both CodeMirror 6 HighlightStyle and Shiki Custom Themes.
 */

export type ThemeType = 'warm' | 'night' | 'plain';

export interface SyntaxTokenColors {
  keyword: string;
  string: string;
  number: string;
  comment: string;
  function: string;
  type: string;
  tag: string;
  attribute: string;
  variable: string;
  punctuation: string;
  diffInsert: string;
  diffDelete: string;
  background: string;
}

export const lightSyntaxTokens: SyntaxTokenColors = {
  keyword: '#B5553A',
  string: '#5E7F49',
  number: '#A7731F',
  comment: '#9C9A92',
  function: '#4C6E96',
  type: '#7A5C8E',
  tag: '#9A4A3A',
  attribute: '#8A6A2C',
  variable: '#2B2A26',
  punctuation: '#6B6860',
  diffInsert: '#5E7F49',
  diffDelete: '#B5553A',
  background: '#F0EEE6',
};

export const darkSyntaxTokens: SyntaxTokenColors = {
  keyword: '#E0805F',
  string: '#9DBB7D',
  number: '#D9A95A',
  comment: '#77756D',
  function: '#8FB0D6',
  type: '#B79BCB',
  tag: '#E59A83',
  attribute: '#C9A55F',
  variable: '#ECEAE3',
  punctuation: '#A8A59B',
  diffInsert: '#9DBB7D',
  diffDelete: '#E0805F',
  background: '#2E2D2A',
};

export function getSyntaxTokens(theme: ThemeType = 'warm'): SyntaxTokenColors {
  return theme === 'night' ? darkSyntaxTokens : lightSyntaxTokens;
}

/**
 * Returns Shiki custom theme registration object.
 */
export function getShikiTheme(theme: ThemeType = 'warm') {
  const isNight = theme === 'night';
  const tokens = isNight ? darkSyntaxTokens : lightSyntaxTokens;
  const themeName = isNight ? 'markyourdown-night' : 'markyourdown-warm';

  return {
    name: themeName,
    type: isNight ? ('dark' as const) : ('light' as const),
    fg: tokens.variable,
    bg: tokens.background,
    settings: [
      {
        settings: {
          foreground: tokens.variable,
          background: tokens.background,
        },
      },
      {
        scope: [
          'keyword',
          'storage',
          'storage.type',
          'storage.modifier',
          'keyword.control',
          'keyword.operator.new',
          'keyword.operator.expression',
          'keyword.operator.logical',
        ],
        settings: {
          foreground: tokens.keyword,
        },
      },
      {
        scope: ['string', 'string.quoted', 'string.template', 'punctuation.definition.string'],
        settings: {
          foreground: tokens.string,
        },
      },
      {
        scope: ['constant.numeric', 'constant.language', 'constant.character', 'constant.other'],
        settings: {
          foreground: tokens.number,
        },
      },
      {
        scope: ['comment', 'punctuation.definition.comment'],
        settings: {
          foreground: tokens.comment,
          fontStyle: 'italic',
        },
      },
      {
        scope: [
          'entity.name.function',
          'support.function',
          'meta.function-call.generic',
          'variable.function',
        ],
        settings: {
          foreground: tokens.function,
        },
      },
      {
        scope: [
          'entity.name.type',
          'entity.name.class',
          'support.type',
          'support.class',
          'entity.other.inherited-class',
        ],
        settings: {
          foreground: tokens.type,
        },
      },
      {
        scope: ['entity.name.tag', 'meta.tag.sgml'],
        settings: {
          foreground: tokens.tag,
        },
      },
      {
        scope: ['entity.other.attribute-name'],
        settings: {
          foreground: tokens.attribute,
        },
      },
      {
        scope: [
          'punctuation',
          'punctuation.separator',
          'punctuation.terminator',
          'punctuation.accessor',
          'keyword.operator',
        ],
        settings: {
          foreground: tokens.punctuation,
        },
      },
      {
        scope: ['markup.inserted', 'meta.diff.header.to-file'],
        settings: {
          foreground: tokens.diffInsert,
        },
      },
      {
        scope: ['markup.deleted', 'meta.diff.header.from-file'],
        settings: {
          foreground: tokens.diffDelete,
        },
      },
    ],
  };
}

/**
 * CodeMirror 6 HighlightStyle spec builder.
 * Can be passed directly to tags/HighlightStyle.define from @codemirror/language.
 */
export function getCodeMirrorStyleSpec(t: any, theme: ThemeType = 'warm') {
  const tokens = getSyntaxTokens(theme);
  return [
    { tag: t.keyword, color: tokens.keyword },
    { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: tokens.variable },
    { tag: [t.function(t.variableName), t.labelName], color: tokens.function },
    { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: tokens.number },
    { tag: [t.definition(t.name), t.separator], color: tokens.punctuation },
    { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: tokens.type },
    { tag: [t.number], color: tokens.number },
    { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: tokens.punctuation },
    { tag: [t.meta, t.comment], color: tokens.comment, fontStyle: 'italic' },
    { tag: t.strong, fontWeight: 'bold' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link, color: tokens.keyword, textDecoration: 'underline' },
    { tag: t.heading, fontWeight: 'bold', color: tokens.variable },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: tokens.number },
    { tag: [t.processingInstruction, t.string, t.inserted], color: tokens.string },
    { tag: [t.tagName], color: tokens.tag },
    { tag: [t.attributeName], color: tokens.attribute },
  ];
}
