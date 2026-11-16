/**
 * ExportHost: Isolated host for rendering and sanitizing Mermaid diagrams and DOM elements (Chapter 9.1)
 */

import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { getMermaidConfig, type ThemeType } from '../shared/mermaidConfig';

let mermaidIdCounter = 0;

export class ExportHost {
  private static initializedTheme: ThemeType | null = null;

  public static initMermaid(theme: ThemeType = 'warm') {
    if (this.initializedTheme !== theme) {
      try {
        mermaid.initialize({
          ...getMermaidConfig(theme),
          suppressErrorRendering: true,
        });
        this.initializedTheme = theme;
      } catch (e) {
        console.warn('ExportHost: mermaid.initialize failed', e);
      }
    }
  }

  /**
   * Render Mermaid code to sanitized inline SVG string.
   * If rendering fails, returns original code wrapped in fallback block.
   */
  public static async renderMermaidSvg(code: string, theme: ThemeType = 'warm'): Promise<string> {
    this.initMermaid(theme);
    const id = `mermaid-export-${++mermaidIdCounter}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        // Headless / SSR fallback
        return `<pre class="mermaid"><code>${this.escapeHtml(code)}</code></pre>`;
      }

      const { svg } = await mermaid.render(id, code.trim());

      // Sanitize SVG with DOMPurify while preserving internal style, foreignObject and text layout
      const sanitizedSvg = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true, html: true },
        ADD_TAGS: ['style', 'use', 'foreignObject', 'div', 'span', 'p'],
        ADD_ATTR: ['dominant-baseline', 'text-anchor', 'transform', 'style', 'class', 'id'],
      });

      return `<div class="myd-mermaid" style="text-align:center;margin:1.6em 0;overflow-x:auto;">${sanitizedSvg}</div>`;
    } catch (err) {
      console.warn('ExportHost: Failed to render mermaid diagram, falling back to code block', err);
      // Clean up any stray error elements created by mermaid in DOM
      if (typeof document !== 'undefined') {
        const stray = document.getElementById(id) || document.getElementById('d' + id);
        if (stray) stray.remove();
      }
      return `<pre class="mermaid-fallback"><code class="language-mermaid">${this.escapeHtml(code)}</code></pre>`;
    }
  }

  public static sanitizeHtml(html: string): string {
    if (typeof window === 'undefined') {
      return html;
    }
    return DOMPurify.sanitize(html, {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'href'],
      ALLOW_DATA_ATTR: false,
    });
  }

  public static escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
