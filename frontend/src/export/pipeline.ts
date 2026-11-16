/**
 * Document Export Pipeline (Chapter 9.1 & 6.9)
 * Unified AST processing, Frontmatter extraction, Shiki highlighting, KaTeX, Mermaid, and Sanitization.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import * as jsYaml from 'js-yaml';
const yamlLoad = (jsYaml as any).load || (jsYaml as any).default?.load || jsYaml;
import { createHighlighter, type Highlighter } from 'shiki';

import {
  getSharedRemarkPlugins,
  extractHeadings,
  remarkCallout,
  remarkInlineSyntax,
  type HeadingItem,
} from '../shared/remarkPlugins';
import { sharedKatexOptions } from '../shared/katexConfig';
import { getShikiTheme, type ThemeType } from '../shared/syntaxPalette';
import { ExportHost } from './ExportHost';

export interface PipelineOptions {
  theme?: ThemeType;
  title?: string;
  filename?: string;
  includeToc?: boolean;
  imageResolver?: (src: string) => Promise<string>;
}

export interface PipelineResult {
  contentHtml: string;
  title: string;
  headings: HeadingItem[];
  hasMath: boolean;
  hasMermaid: boolean;
  frontmatter: Record<string, any>;
}

// Allowed tags & attributes for strict sanitization without scripts (Chapter 8.5 & 9.1)
export const exportSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'mark',
    'sub',
    'sup',
    // SVG elements (for Mermaid & inline vectors)
    'svg',
    'path',
    'g',
    'rect',
    'circle',
    'line',
    'polygon',
    'polyline',
    'ellipse',
    'text',
    'tspan',
    'defs',
    'clippath',
    'use',
    'marker',
    'linearGradient',
    'radialGradient',
    'stop',
    // MathML elements (for KaTeX)
    'math',
    'mrow',
    'mi',
    'mn',
    'mo',
    'ms',
    'mspace',
    'mtext',
    'mfrac',
    'mroot',
    'msqrt',
    'msub',
    'msup',
    'msubsup',
    'munder',
    'mover',
    'munderover',
    'mtable',
    'mtr',
    'mtd',
    'annotation',
    'semantics',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] || []),
      'className',
      'class',
      'style',
      'id',
      'ariaHidden',
      'aria-hidden',
      'ariaLabel',
      'aria-label',
    ],
    svg: ['viewBox', 'width', 'height', 'xmlns', 'fill', 'stroke', 'strokeWidth', 'class', 'className', 'style', 'id'],
    path: ['d', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'markerEnd', 'markerStart', 'transform', 'class', 'className'],
    g: ['transform', 'fill', 'stroke', 'class', 'className'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'class', 'className'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'class', 'className'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'class', 'className'],
    use: ['href', 'xlinkHref', 'x', 'y', 'width', 'height'],
    math: ['xmlns', 'display'],
    annotation: ['encoding'],
    a: ['href', 'title', 'target', 'rel'],
    input: ['type', 'disabled', 'checked'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', '#'],
    src: ['http', 'https', 'data'],
  },
};

const COMMON_LANGUAGES = [
  'javascript',
  'typescript',
  'html',
  'css',
  'json',
  'markdown',
  'python',
  'go',
  'rust',
  'c',
  'cpp',
  'bash',
  'shell',
  'yaml',
  'sql',
  'xml',
  'diff',
];

let cachedHighlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighterInstance(): Promise<Highlighter> {
  if (cachedHighlighter) return cachedHighlighter;
  if (!highlighterPromise) {
    const warmTheme = getShikiTheme('warm');
    const nightTheme = getShikiTheme('night');
    highlighterPromise = createHighlighter({
      themes: [warmTheme, nightTheme],
      langs: COMMON_LANGUAGES,
    }).then((h) => {
      cachedHighlighter = h;
      return h;
    });
  }
  return highlighterPromise;
}

/**
 * Process Markdown through unified pipeline and render HTML content with metadata.
 */
export async function processMarkdown(
  markdown: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const theme: ThemeType = options.theme || 'warm';
  let frontmatterData: Record<string, any> = {};
  let firstH1Text = '';
  let hasMath = false;
  let hasMermaid = false;

  // 1. Initial parse to AST
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkCallout)
    .use(remarkInlineSyntax);

  const tree = processor.parse(markdown);

  // 2. Extract frontmatter
  visit(tree, 'yaml', (node: any) => {
    try {
      const parsed = typeof yamlLoad === 'function' ? yamlLoad(node.value) : null;
      if (parsed && typeof parsed === 'object') {
        frontmatterData = parsed as Record<string, any>;
      }
    } catch (e) {
      console.warn('Pipeline: Failed to parse YAML frontmatter', e);
    }
  });

  // 3. Extract headings and slug IDs
  const headings = extractHeadings(tree);

  // Find first H1 for document title fallback
  const firstH1 = headings.find((h) => h.depth === 1);
  if (firstH1) {
    firstH1Text = firstH1.text.trim();
  }

  // 4. Preprocess AST nodes: Math detection, Mermaid and Shiki code highlighting, Images, External links
  const codeNodesToHighlight: { node: any; lang: string; code: string }[] = [];
  const mermaidNodesToRender: { node: any; code: string }[] = [];
  const imageNodesToResolve: { node: any; url: string }[] = [];

  visit(tree, (node: any) => {
    // Detect math
    if (node.type === 'inlineMath' || node.type === 'math') {
      hasMath = true;
    }

    // Detect code blocks
    if (node.type === 'code') {
      const lang = (node.lang || '').trim().toLowerCase();
      if (lang === 'mermaid') {
        hasMermaid = true;
        mermaidNodesToRender.push({ node, code: node.value });
      } else {
        codeNodesToHighlight.push({ node, lang: lang || 'text', code: node.value });
      }
    }

    // Detect images
    if (node.type === 'image' && options.imageResolver) {
      const url = node.url || '';
      if (!url.startsWith('data:') && !url.startsWith('http://') && !url.startsWith('https://')) {
        imageNodesToResolve.push({ node, url });
      }
    }

    // Remove [TOC] marker if present in body
    if (node.type === 'paragraph' && node.children && node.children.length === 1) {
      const textChild = node.children[0];
      if (textChild.type === 'text' && /^\[toc\]$/i.test(textChild.value.trim())) {
        node.type = 'html';
        node.value = '';
      }
    }
  });

  // Render Mermaid diagrams with DOMPurify sanitization and placeholder protection
  const mermaidPlaceholders: Array<{ placeholder: string; svgHtml: string }> = [];
  if (mermaidNodesToRender.length > 0) {
    await Promise.all(
      mermaidNodesToRender.map(async ({ node, code }, idx) => {
        const svgHtml = await ExportHost.renderMermaidSvg(code, theme);
        const placeholder = `<div class="myd-mermaid-placeholder-${idx}"></div>`;
        mermaidPlaceholders.push({ placeholder, svgHtml });
        node.type = 'html';
        node.value = placeholder;
      })
    );
  }

  // Highlight code blocks with Shiki
  if (codeNodesToHighlight.length > 0) {
    try {
      const highlighter = await getHighlighterInstance();
      const shikiThemeName = theme === 'night' ? 'markyourdown-night' : 'markyourdown-warm';

      for (const item of codeNodesToHighlight) {
        let lang = item.lang;
        if (!highlighter.getLoadedLanguages().includes(lang)) {
          // Fallback to text if language not loaded
          lang = 'text';
        }
        try {
          const highlighted = highlighter.codeToHtml(item.code, {
            lang,
            theme: shikiThemeName,
          });
          item.node.type = 'html';
          item.node.value = highlighted;
        } catch {
          // Fallback if highlight fails
          item.node.type = 'html';
          item.node.value = `<pre class="shiki ${shikiThemeName}"><code>${ExportHost.escapeHtml(item.code)}</code></pre>`;
        }
      }
    } catch (e) {
      console.warn('Pipeline: Shiki highlighting fallback', e);
    }
  }

  // Resolve local images
  if (imageNodesToResolve.length > 0 && options.imageResolver) {
    await Promise.all(
      imageNodesToResolve.map(async ({ node, url }) => {
        try {
          const resolved = await options.imageResolver!(url);
          if (resolved) {
            node.url = resolved;
          }
        } catch (err) {
          console.warn(`Pipeline: Failed to resolve image "${url}"`, err);
        }
      })
    );
  }

  // 5. Transform AST to Rehype and generate HTML
  const hast = await processor.run(tree);

  // Ensure external links have target="_blank" rel="noopener noreferrer" (Chapter 9.1 rule 8)
  visit(hast, 'element', (node: any) => {
    if (node.tagName === 'a' && node.properties && node.properties.href) {
      const href = String(node.properties.href);
      if (href.startsWith('http://') || href.startsWith('https://')) {
        node.properties.target = '_blank';
        node.properties.rel = 'noopener noreferrer';
      }
    }
  });

  // Resolve raw HTML <img> tags if any
  if (options.imageResolver) {
    const rawImgs: Array<{ properties: any; src: string }> = [];
    visit(hast, 'element', (node: any) => {
      if (node.tagName === 'img' && node.properties && node.properties.src) {
        const src = String(node.properties.src);
        if (!src.startsWith('data:') && !src.startsWith('http://') && !src.startsWith('https://')) {
          rawImgs.push({ properties: node.properties, src });
        }
      }
    });
    if (rawImgs.length > 0) {
      await Promise.all(
        rawImgs.map(async (item) => {
          try {
            const resolved = await options.imageResolver!(item.src);
            if (resolved) {
              item.properties.src = resolved;
            }
          } catch {}
        })
      );
    }
  }

  const rehypeProcessor = unified()
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex, sharedKatexOptions as any)
    .use(rehypeSanitize, exportSanitizeSchema)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const finalTree = (await rehypeProcessor.run(hast as any)) as any;
  let contentHtml = String(await rehypeProcessor.stringify(finalTree));

  // Restore DOMPurify-sanitized Mermaid SVGs
  for (const { placeholder, svgHtml } of mermaidPlaceholders) {
    contentHtml = contentHtml.replace(placeholder, svgHtml);
  }

  // Determine Title: Front Matter title -> first H1 -> filename -> "未命名文档"
  const documentTitle =
    (frontmatterData.title && String(frontmatterData.title).trim()) ||
    firstH1Text ||
    options.title ||
    options.filename ||
    '未命名文档';

  return {
    contentHtml,
    title: documentTitle,
    headings,
    hasMath,
    hasMermaid,
    frontmatter: frontmatterData,
  };
}
