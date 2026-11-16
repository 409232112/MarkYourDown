/**
 * Shared Remark & Unified Plugins (Chapter 3, 6.9, 9.1)
 * Used by both the Milkdown editor and the Export pipeline.
 */

import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visit } from 'unist-util-visit';
import GithubSlugger from 'github-slugger';
import type { Plugin } from 'unified';
import type { Node, Parent } from 'unist';

export interface HeadingItem {
  depth: number;
  text: string;
  id: string;
}

export const CALLOUT_TYPES = {
  NOTE: { name: 'note', label: '注意' },
  TIP: { name: 'tip', label: '提示' },
  IMPORTANT: { name: 'important', label: '重要' },
  WARNING: { name: 'warning', label: '警告' },
  CAUTION: { name: 'caution', label: '小心' },
} as const;

export type CalloutType = keyof typeof CALLOUT_TYPES;

/**
 * Remark plugin to transform GitHub-style callout blockquotes:
 * > [!NOTE]
 * > Content
 */
export const remarkCallout: Plugin = () => {
  return (tree: Node) => {
    visit(tree, 'blockquote', (node: any, index: number | undefined, parent: Parent | undefined) => {
      if (!node.children || node.children.length === 0) return;
      const firstChild = node.children[0];
      if (firstChild.type !== 'paragraph' || !firstChild.children || firstChild.children.length === 0) return;

      const firstInline = firstChild.children[0];
      if (firstInline.type !== 'text') return;

      const match = firstInline.value.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n)?/i);
      if (!match) return;

      const rawType = match[1].toUpperCase() as CalloutType;
      const calloutConfig = CALLOUT_TYPES[rawType] || CALLOUT_TYPES.NOTE;

      // Strip the [!TYPE] marker from the text
      firstInline.value = firstInline.value.slice(match[0].length);
      if (firstInline.value.trim() === '' && firstChild.children.length > 1) {
        firstChild.children.shift();
      }

      // Convert blockquote to a callout container
      node.data = node.data || {};
      node.data.hName = 'div';
      node.data.hProperties = {
        className: ['myd-callout', `myd-callout-${calloutConfig.name}`],
      };

      // Insert title node at top
      const titleNode = {
        type: 'paragraph',
        data: {
          hName: 'div',
          hProperties: {
            className: ['myd-callout-title'],
          },
        },
        children: [
          {
            type: 'text',
            value: calloutConfig.label,
          },
        ],
      };

      node.children.unshift(titleNode);
    });
  };
};

/**
 * Remark plugin to support ==highlight==, ^sup^, ~sub~ and simple emoji replacements
 */
export const remarkInlineSyntax: Plugin = () => {
  return (tree: Node) => {
    visit(tree, 'text', (node: any, index: number | undefined, parent: Parent | undefined) => {
      if (!parent || typeof index !== 'number') return;
      const value: string = node.value;
      if (!value) return;

      // Check if text contains ==highlight==, ^sup^, ~sub~ or :emoji:
      const hasHighlight = /==([^=\n]+)==/.test(value);
      const hasSup = /\^([^\^\n]+)\^/.test(value);
      const hasSub = /(?<!~)~([^~\n]+)~(?!~)/.test(value);

      if (!hasHighlight && !hasSup && !hasSub) return;

      // Regex matching tokens: ==...==, ^...^, ~...~
      const tokenRegex = /(==([^=\n]+)==|\^([^\^\n]+)\^|(?<!~)~([^~\n]+)~(?!~))/g;
      const newChildren: any[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = tokenRegex.exec(value)) !== null) {
        if (match.index > lastIndex) {
          newChildren.push({
            type: 'text',
            value: value.substring(lastIndex, match.index),
          });
        }

        const fullMatch = match[0];
        if (fullMatch.startsWith('==')) {
          newChildren.push({
            type: 'html',
            value: `<mark>${match[2]}</mark>`,
          });
        } else if (fullMatch.startsWith('^')) {
          newChildren.push({
            type: 'html',
            value: `<sup>${match[3]}</sup>`,
          });
        } else if (fullMatch.startsWith('~')) {
          newChildren.push({
            type: 'html',
            value: `<sub>${match[4]}</sub>`,
          });
        }
        lastIndex = tokenRegex.lastIndex;
      }

      if (lastIndex < value.length) {
        newChildren.push({
          type: 'text',
          value: value.substring(lastIndex),
        });
      }

      parent.children.splice(index, 1, ...newChildren);
    });
  };
};

/**
 * Helper to extract table of contents and headings from mdast.
 */
export function extractHeadings(tree: Node): HeadingItem[] {
  const headings: HeadingItem[] = [];
  const slugger = new GithubSlugger();

  visit(tree, 'heading', (node: any) => {
    let headingText = '';
    visit(node, 'text', (textNode: any) => {
      headingText += textNode.value;
    });
    const id = slugger.slug(headingText);
    headings.push({
      depth: node.depth,
      text: headingText,
      id,
    });

    // Ensure node has heading id attached
    node.data = node.data || {};
    node.data.hProperties = node.data.hProperties || {};
    node.data.hProperties.id = id;
  });

  return headings;
}

/**
 * Returns the list of standard remark plugins shared across editor and export.
 */
export function getSharedRemarkPlugins(): any[] {
  return [
    remarkFrontmatter,
    [remarkGfm, { singleTilde: false }],
    remarkMath,
    remarkCallout,
    remarkInlineSyntax,
  ];
}
