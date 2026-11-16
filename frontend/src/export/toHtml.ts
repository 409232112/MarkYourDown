/**
 * Self-contained HTML Export Generator (Chapter 9.1)
 * Produces a standalone, single HTML file with pure CSS sticky TOC,
 * inlined tokens.css, content.css, theme variables, KaTeX styles, and strict CSP.
 * Contains ZERO <script> tags.
 */

import { processMarkdown, type PipelineOptions, type PipelineResult } from './pipeline';
import { type ThemeType } from '../shared/syntaxPalette';
import { type HeadingItem } from '../shared/remarkPlugins';

import { getTokensCss, getContentCss, getKatexCss } from '../styles/cssBundle';

export interface HtmlExportOptions extends PipelineOptions {
  includeToc?: boolean;
  convertMdLinksToHtml?: boolean;
}

/**
 * Generate pure CSS sticky TOC HTML
 */
export function generatePureCssToc(headings: HeadingItem[]): string {
  if (!headings || headings.length === 0) return '';

  const items = headings
    .filter((h) => h.depth <= 3) // H1 ~ H3 in TOC
    .map((h) => {
      const depthClass = `myd-toc-depth-${h.depth}`;
      const escapedText = h.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<li class="myd-toc-item ${depthClass}"><a href="#${h.id}">${escapedText}</a></li>`;
    })
    .join('\n');

  return `
    <nav class="myd-toc-container" aria-label="目录">
      <div class="myd-toc-title">目录</div>
      <ul class="myd-toc-list">
        ${items}
      </ul>
    </nav>
  `;
}

/**
 * Exports Markdown string to a self-contained single HTML string.
 */
export async function exportToHtml(
  markdown: string,
  options: HtmlExportOptions = {}
): Promise<string> {
  const theme: ThemeType = options.theme || 'warm';
  const includeToc = options.includeToc === true;

  let processedMarkdown = markdown;
  // Convert .md relative links to .html if requested (Chapter 9.1 rule 8)
  if (options.convertMdLinksToHtml) {
    processedMarkdown = processedMarkdown.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\.md((?:#[^)]+)?)\)/g, '[$1]($2.html$3)');
  }

  const result: PipelineResult = await processMarkdown(processedMarkdown, {
    theme,
    title: options.title,
    filename: options.filename,
    includeToc,
    imageResolver: options.imageResolver,
  });

  const tocHtml = includeToc && result.headings.length > 0 ? generatePureCssToc(result.headings) : '';
  const escapedTitle = result.title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Strict CSP per Chapter 9.1:
  // default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; font-src data:;
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; font-src data:;">`;

  const tokensCssContent = getTokensCss();
  const contentCssContent = getContentCss();
  const katexCssContent = getKatexCss();

  // KaTeX CSS included if document contains math formulas
  const mathStyles = result.hasMath && katexCssContent ? `<style id="myd-katex-styles">\n${katexCssContent}\n</style>` : '';

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMeta}
  <title>${escapedTitle}</title>
  <style id="myd-tokens">
${tokensCssContent}
  </style>
  <style id="myd-content-styles">
${contentCssContent}
  </style>
  <style> .myd-content { max-width: 1400px; padding: 48px clamp(24px, 4vw, 64px) 80px; } </style>
  ${mathStyles}
</head>
<body>
  <div class="myd-layout">
    ${tocHtml}
    <article class="myd-content">
      ${result.contentHtml}
    </article>
  </div>
</body>
</html>`;
}
