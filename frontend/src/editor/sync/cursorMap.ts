import type { Baseline, BlockRecord } from '../../shared/types';

export interface CursorLiveToSourceResult {
  offset: number;
  blockIndex: number;
  blockRatio: number;
}

export interface CursorSourceToLiveResult {
  pmPos: number;
  blockIndex: number;
  blockRatio: number;
}

/**
 * Maps a ProseMirror position to a CodeMirror 6 source text offset.
 * Follows Chapter 6.3:
 * 取光标所在顶层块序号 + 块内文本偏移，在该块的源码区间内，用光标前后各 ≤ 24 个可见字符做就近匹配定位；匹配失败降级到块首。
 */
export function mapLiveToSource(
  pmPos: number,
  pmDoc: any,
  baseline: Baseline
): CursorLiveToSourceResult {
  if (!pmDoc || !pmDoc.childCount || baseline.blocks.length === 0) {
    return { offset: 0, blockIndex: 0, blockRatio: 0 };
  }

  let currentPmPos = 0;
  let targetBlockIndex = 0;
  let offsetInBlock = 0;
  let targetBlockNode: any = null;

  for (let i = 0; i < pmDoc.childCount; i++) {
    const child = pmDoc.child(i);
    const childSize = child.nodeSize;
    if (pmPos >= currentPmPos && pmPos <= currentPmPos + childSize) {
      targetBlockIndex = i;
      offsetInBlock = Math.max(0, pmPos - currentPmPos - 1);
      targetBlockNode = child;
      break;
    }
    currentPmPos += childSize;
  }

  // Safety fallback if pos is beyond doc
  if (!targetBlockNode && pmDoc.childCount > 0) {
    targetBlockIndex = pmDoc.childCount - 1;
    targetBlockNode = pmDoc.child(targetBlockIndex);
    offsetInBlock = targetBlockNode.content.size;
  }

  if (targetBlockIndex >= baseline.blocks.length) {
    targetBlockIndex = Math.max(0, baseline.blocks.length - 1);
  }

  const blockRecord: BlockRecord = baseline.blocks[targetBlockIndex];
  if (!blockRecord) {
    return { offset: 0, blockIndex: 0, blockRatio: 0 };
  }

  const blockSource = baseline.src.slice(blockRecord.start, blockRecord.end);
  const blockTotalLen = blockSource.length;

  if (blockTotalLen === 0) {
    return { offset: blockRecord.start, blockIndex: targetBlockIndex, blockRatio: 0 };
  }

  // Extract up to 24 characters before and after cursor in PM node
  const nodeText = targetBlockNode.textContent || '';
  const textBefore = nodeText.slice(Math.max(0, offsetInBlock - 24), offsetInBlock);
  const textAfter = nodeText.slice(offsetInBlock, offsetInBlock + 24);

  let bestOffset = -1;

  if (textBefore.length >= 3 && textAfter.length >= 3) {
    const snippet = textBefore.slice(-8) + textAfter.slice(0, 8);
    const idx = blockSource.indexOf(snippet);
    if (idx !== -1) {
      bestOffset = blockRecord.start + idx + textBefore.slice(-8).length;
    }
  }

  if (bestOffset === -1 && textBefore.length >= 3) {
    const snippet = textBefore.slice(-12);
    const idx = blockSource.lastIndexOf(snippet);
    if (idx !== -1) {
      bestOffset = blockRecord.start + idx + snippet.length;
    }
  }

  if (bestOffset === -1 && textAfter.length >= 3) {
    const snippet = textAfter.slice(0, 12);
    const idx = blockSource.indexOf(snippet);
    if (idx !== -1) {
      bestOffset = blockRecord.start + idx;
    }
  }

  // Fallback to relative ratio or block start
  if (bestOffset === -1) {
    const ratio = nodeText.length > 0 ? offsetInBlock / nodeText.length : 0;
    bestOffset = blockRecord.start + Math.floor(ratio * blockTotalLen);
  }

  // Ensure within bounds
  bestOffset = Math.max(blockRecord.start, Math.min(blockRecord.end, bestOffset));

  const blockRatio = blockTotalLen > 0 ? (bestOffset - blockRecord.start) / blockTotalLen : 0;

  return {
    offset: bestOffset,
    blockIndex: targetBlockIndex,
    blockRatio,
  };
}

/**
 * Maps a CodeMirror 6 source text offset to a ProseMirror position.
 * Reverse mapping:
 * 源码偏移 → 所在块序号 → 块内文本匹配，失败降级到块首。
 */
export function mapSourceToLive(
  srcOffset: number,
  baseline: Baseline,
  pmDoc: any
): CursorSourceToLiveResult {
  if (!pmDoc || !pmDoc.childCount || baseline.blocks.length === 0) {
    return { pmPos: 0, blockIndex: 0, blockRatio: 0 };
  }

  // Find block index in baseline that contains or is closest to srcOffset
  let targetBlockIndex = 0;
  for (let i = 0; i < baseline.blocks.length; i++) {
    const b = baseline.blocks[i];
    if (srcOffset >= b.start && srcOffset <= b.end) {
      targetBlockIndex = i;
      break;
    }
    if (srcOffset < b.start) {
      targetBlockIndex = Math.max(0, i - 1);
      break;
    }
    if (i === baseline.blocks.length - 1) {
      targetBlockIndex = i;
    }
  }

  const blockRecord = baseline.blocks[targetBlockIndex];
  if (!blockRecord) {
    return { pmPos: 0, blockIndex: 0, blockRatio: 0 };
  }

  const blockLen = blockRecord.end - blockRecord.start;
  const relativeOffset = Math.max(0, srcOffset - blockRecord.start);
  const blockRatio = blockLen > 0 ? Math.min(1, relativeOffset / blockLen) : 0;

  // Calculate PM pos for start of targetBlockIndex
  let blockStartPmPos = 0;
  for (let i = 0; i < targetBlockIndex && i < pmDoc.childCount; i++) {
    blockStartPmPos += pmDoc.child(i).nodeSize;
  }

  if (targetBlockIndex >= pmDoc.childCount) {
    return { pmPos: blockStartPmPos, blockIndex: targetBlockIndex, blockRatio };
  }

  const targetNode = pmDoc.child(targetBlockIndex);
  const nodeText = targetNode.textContent || '';

  // Extract snippet around srcOffset in source
  const srcSlice = baseline.src.slice(blockRecord.start, blockRecord.end);
  const textBefore = srcSlice.slice(Math.max(0, relativeOffset - 16), relativeOffset).trim();
  const textAfter = srcSlice.slice(relativeOffset, relativeOffset + 16).trim();

  let matchedOffsetInText = -1;
  if (textBefore.length >= 3) {
    const idx = nodeText.lastIndexOf(textBefore);
    if (idx !== -1) {
      matchedOffsetInText = idx + textBefore.length;
    }
  }
  if (matchedOffsetInText === -1 && textAfter.length >= 3) {
    const idx = nodeText.indexOf(textAfter);
    if (idx !== -1) {
      matchedOffsetInText = idx;
    }
  }

  if (matchedOffsetInText === -1) {
    matchedOffsetInText = Math.floor(blockRatio * nodeText.length);
  }

  // In PM, position inside a block = blockStartPmPos + 1 (inside opening tag) + offset
  const finalPmPos = Math.min(blockStartPmPos + targetNode.nodeSize - 1, blockStartPmPos + 1 + matchedOffsetInText);

  return {
    pmPos: Math.max(0, finalPmPos),
    blockIndex: targetBlockIndex,
    blockRatio,
  };
}

/**
 * High-level helper for UI mode switching
 */
export function pmToCmCursor(pmDoc: any, pos: number, baseline?: Baseline): number {
  const base = baseline || {
    src: pmDoc.textContent || '',
    doc: pmDoc,
    blocks: [],
    tail: '',
    style: {
      bullet: '-',
      emphasis: '*',
      strong: '**',
      fence: '`',
      rule: '-',
      orderedDelim: '.',
      listIndent: 'one',
      eol: 'lf',
    },
  };
  return mapLiveToSource(pos, pmDoc, base).offset;
}

/**
 * High-level helper for UI mode switching
 */
export function cmToPmCursor(srcOrBaseline: string | Baseline, offset: number, pmDoc?: any): number {
  let base: Baseline;
  if (typeof srcOrBaseline === 'string') {
    base = {
      src: srcOrBaseline,
      doc: pmDoc,
      blocks: [],
      tail: '',
      style: {
        bullet: '-',
        emphasis: '*',
        strong: '**',
        fence: '`',
        rule: '-',
        orderedDelim: '.',
        listIndent: 'one',
        eol: 'lf',
      },
    };
  } else {
    base = srcOrBaseline;
  }
  return mapSourceToLive(offset, base, pmDoc).pmPos;
}

