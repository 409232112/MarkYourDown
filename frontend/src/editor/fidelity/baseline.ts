import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkFrontmatter from 'remark-frontmatter';
import type { Baseline, BlockRecord, StyleProfile } from '../../shared/types';
import { detectStyleProfile } from './styleProfile';

// Shared parser processor for building mdast with exact offsets
const mdastProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkFrontmatter, ['yaml', 'toml']);

export function parseToMdast(src: string): any {
  return mdastProcessor.parse(src);
}

export function buildBaseline(src: string, pmDoc?: any): Baseline {
  const style = detectStyleProfile(src);

  if (!src || src.trim().length === 0) {
    return {
      src,
      doc: pmDoc,
      blocks: [],
      tail: src,
      style,
      fallbackFullSerialize: false,
    };
  }

  const mdast = parseToMdast(src);
  const children: any[] = mdast.children || [];

  const blocks: BlockRecord[] = [];
  let lastEnd = 0;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const pos = child.position;
    if (!pos || pos.start.offset === undefined || pos.end.offset === undefined) {
      continue;
    }

    const start = pos.start.offset;
    const end = pos.end.offset;
    const gapBefore = src.slice(lastEnd, start);
    lastEnd = end;

    // Check for F2 child items (list items or blockquote children)
    let childRecords: BlockRecord[] | undefined;
    if (child.type === 'list' && Array.isArray(child.children)) {
      childRecords = [];
      let itemLastEnd = start;
      for (const item of child.children) {
        if (item.position && item.position.start.offset !== undefined && item.position.end.offset !== undefined) {
          const itemStart = item.position.start.offset;
          const itemEnd = item.position.end.offset;
          const itemGap = src.slice(itemLastEnd, itemStart);
          itemLastEnd = itemEnd;
          childRecords.push({
            node: null, // to be mapped to PM child
            start: itemStart,
            end: itemEnd,
            gapBefore: itemGap,
          });
        }
      }
    } else if (child.type === 'blockquote' && Array.isArray(child.children)) {
      childRecords = [];
      let itemLastEnd = start;
      for (const item of child.children) {
        if (item.position && item.position.start.offset !== undefined && item.position.end.offset !== undefined) {
          const itemStart = item.position.start.offset;
          const itemEnd = item.position.end.offset;
          const itemGap = src.slice(itemLastEnd, itemStart);
          itemLastEnd = itemEnd;
          childRecords.push({
            node: null,
            start: itemStart,
            end: itemEnd,
            gapBefore: itemGap,
          });
        }
      }
    }

    // Associate with PM node if pmDoc is available
    let pmNode: any = null;
    if (pmDoc && pmDoc.childCount) {
      if (i < pmDoc.childCount) {
        pmNode = pmDoc.child(i);
        // Map child items if applicable
        if (childRecords && pmNode.childCount === childRecords.length) {
          for (let j = 0; j < pmNode.childCount; j++) {
            childRecords[j].node = pmNode.child(j);
          }
        }
      }
    }

    blocks.push({
      node: pmNode,
      start,
      end,
      gapBefore,
      children: childRecords,
    });
  }

  const tail = src.slice(lastEnd);

  // Check 1:1 mapping between mdast children and pmDoc top-level nodes
  let fallbackFullSerialize = false;
  if (pmDoc && pmDoc.childCount !== undefined) {
    if (pmDoc.childCount !== blocks.length) {
      // Top-level block count mismatch
      fallbackFullSerialize = true;
    }
  }

  return {
    src,
    doc: pmDoc,
    blocks,
    tail,
    style,
    fallbackFullSerialize,
  };
}
