import { describe, it, expect } from 'vitest';
import { processMarkdown } from '../pipeline';
import { exportToHtml } from '../toHtml';
import { extractHeadings } from '../../shared/remarkPlugins';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import GithubSlugger from 'github-slugger';

describe('Document Export Pipeline & Shared Syntax', () => {
  it('exports a wide, responsive reading area with consecutive images', async () => {
    const html = await exportToHtml('![first](https://example.com/1.png)\n\n![second](https://example.com/2.png)');
    expect(html).toContain('max-width: 1400px');
    expect(html).toContain('clamp(24px, 4vw, 64px)');
    expect(html).toContain('https://example.com/1.png');
    expect(html).toContain('https://example.com/2.png');
  });
  it('extracts front matter title and metadata', async () => {
    const md = `---
title: 测试导出文档
author: Antigravity
date: 2026-11-14
---

# 一级标题

正文内容。`;

    const res = await processMarkdown(md);
    expect(res.title).toBe('测试导出文档');
    expect(res.frontmatter.author).toBe('Antigravity');
    expect(res.headings.length).toBe(1);
    expect(res.headings[0].text).toBe('一级标题');
  });

  it('falls back to first H1 when front matter title is missing', async () => {
    const md = `# 默认第一标题

正文内容。`;

    const res = await processMarkdown(md);
    expect(res.title).toBe('默认第一标题');
  });

  it('supports Chinese heading slugs and deduplication with -1', () => {
    const slugger = new GithubSlugger();
    const slug1 = slugger.slug('第一章 背景与目标');
    const slug2 = slugger.slug('第一章 背景与目标');
    const slug3 = slugger.slug('Overview');

    expect(slug1).toBe('第一章-背景与目标');
    expect(slug2).toBe('第一章-背景与目标-1');
    expect(slug3).toBe('overview');
  });

  it('parses GitHub-style callouts correctly', async () => {
    const md = `> [!NOTE]
> 这是一个测试提示。

> [!WARNING]
> 这是一个警告信息。`;

    const res = await processMarkdown(md);
    expect(res.contentHtml).toContain('myd-callout-note');
    expect(res.contentHtml).toContain('myd-callout-warning');
    expect(res.contentHtml).toContain('注意');
    expect(res.contentHtml).toContain('警告');
    expect(res.contentHtml).toContain('这是一个测试提示。');
  });

  it('parses inline highlight, superscript and subscript', async () => {
    const md = `这是==高亮文本==，这是^上标^，这是~下标~。`;

    const res = await processMarkdown(md);
    expect(res.contentHtml).toContain('<mark>高亮文本</mark>');
    expect(res.contentHtml).toContain('<sup>上标</sup>');
    expect(res.contentHtml).toContain('<sub>下标</sub>');
  });

  it('renders KaTeX math formulas in HTML+MathML', async () => {
    const md = `行内公式 $E=mc^2$ 与块级公式：

$$\\frac{a}{b}$$`;

    const res = await processMarkdown(md);
    expect(res.hasMath).toBe(true);
    expect(res.contentHtml).toContain('katex');
    expect(res.contentHtml).toContain('math');
  });

  it('highlights code blocks with Shiki using Warm theme colors', async () => {
    const md = `\`\`\`javascript
const greeting = "Hello World";
\`\`\``;

    const res = await processMarkdown(md, { theme: 'warm' });
    expect(res.contentHtml).toContain('shiki markyourdown-warm');
    // Keyword color from syntaxPalette (#B5553A)
    expect(res.contentHtml).toContain('#B5553A');
  });

  it('sanitizes malicious script tags and event handlers', async () => {
    const md = `<script>alert('xss')</script>
<img src="x" onerror="alert(1)">
<a href="javascript:void(0)">恶意链接</a>`;

    const res = await processMarkdown(md);
    expect(res.contentHtml).not.toContain('<script>');
    expect(res.contentHtml).not.toContain('alert');
    expect(res.contentHtml).not.toContain('onerror');
    expect(res.contentHtml).not.toContain('javascript:');
  });

  it('exports self-contained single HTML with strict CSP and NO script tags', async () => {
    const md = `---
title: 自包含导出测试
---

# 章节一

这是第一段正文。

## 章节一小节

一些公式 $x + y = z$。

\`\`\`typescript
const val: number = 42;
\`\`\`
`;

    const html = await exportToHtml(md, { theme: 'warm', includeToc: true });

    // Check standalone document structure
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="zh-CN" data-theme="warm">');
    expect(html).toContain('<title>自包含导出测试</title>');

    // Check inlined styles
    expect(html).toContain('id="myd-tokens"');
    expect(html).toContain('id="myd-content-styles"');
    expect(html).toContain('id="myd-katex-styles"');

    // Check pure CSS sticky TOC
    expect(html).toContain('myd-toc-container');
    expect(html).toContain('myd-toc-title');
    expect(html).toContain('href="#章节一"');
    expect(html).toContain('href="#章节一小节"');

    // Strict CSP check
    expect(html).toContain('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: https: http:; font-src data:;">');

    // CRITICAL: ZERO <script> tags anywhere in the exported HTML!
    expect(html).not.toMatch(/<script\b[^>]*>/i);
  });

  it('renders Mermaid blocks without crashing and marks diagram', async () => {
    const md = `\`\`\`mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
\`\`\``;

    const res = await processMarkdown(md);
    expect(res.hasMermaid).toBe(true);
    expect(res.contentHtml).toContain('mermaid');
  });

  it('renders GFM task list items with disabled checkboxes', async () => {
    const md = `- [x] 已完成任务
- [ ] 未完成任务`;

    const res = await processMarkdown(md);
    expect(res.contentHtml).toContain('type="checkbox"');
    expect(res.contentHtml).toContain('disabled');
    expect(res.contentHtml).toContain('checked');
  });

  it('converts relative .md links to .html when requested', async () => {
    const md = `[链接到文档](doc2.md) 与 [锚点链接](other.md#heading)`;
    const html = await exportToHtml(md, { convertMdLinksToHtml: true });
    expect(html).toContain('href="doc2.html"');
    expect(html).toContain('href="other.html#heading"');
  });

  it('supports Night and Plain theme exports with matching data-theme attribute', async () => {
    const md = `# 标题`;
    const nightHtml = await exportToHtml(md, { theme: 'night' });
    expect(nightHtml).toContain('data-theme="night"');

    const plainHtml = await exportToHtml(md, { theme: 'plain' });
    expect(plainHtml).toContain('data-theme="plain"');
  });

  it('exports HTML without TOC by default', async () => {
    const md = `# 一级标题\n\n## 二级标题\n\n正文内容。`;
    const html = await exportToHtml(md);
    expect(html).not.toContain('myd-toc-container');
    expect(html).not.toContain('myd-toc-title');
  });

  it('resolves local relative images into base64 data URLs', async () => {
    const md = `![示例图片](./assets/test.png)`;
    const dummyBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const html = await exportToHtml(md, {
      imageResolver: async (src) => {
        if (src === './assets/test.png') return dummyBase64;
        return src;
      },
    });
    expect(html).toContain(dummyBase64);
    expect(html).not.toContain('src="./assets/test.png"');
  });
});
