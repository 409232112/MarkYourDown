import type { Baseline, BlockRecord, StyleProfile } from '../../shared/types';

export type NodeSerializer = (node: any, style: StyleProfile) => string;

export interface SerializeResult {
  text: string;
  newBaseline: Baseline;
  eolUnified?: boolean;
}

export function serializeWithBaseline(
  pmDoc: any,
  baseline: Baseline,
  serializer?: NodeSerializer
): SerializeResult {
  // 1. F0: If pmDoc is strictly equal to baseline.doc, return original src untouched (byte-exact).
  if (baseline.doc && pmDoc && typeof pmDoc.eq === 'function' && pmDoc.eq(baseline.doc)) {
    return {
      text: baseline.src,
      newBaseline: baseline,
      eolUnified: false,
    };
  }

  // If there are no nodes in pmDoc
  if (!pmDoc || !pmDoc.childCount || pmDoc.childCount === 0) {
    const newBaseline: Baseline = {
      src: '',
      doc: pmDoc,
      blocks: [],
      tail: '',
      style: baseline.style,
      fallbackFullSerialize: false,
    };
    return {
      text: '',
      newBaseline,
      eolUnified: false,
    };
  }

  const defaultNewline = baseline.style.eol === 'crlf' ? '\r\n\r\n' : '\n\n';
  const singleNewline = baseline.style.eol === 'crlf' ? '\r\n' : '\n';

  if (!serializer) {
    throw new Error('serializeWithBaseline requires a valid NodeSerializer function.');
  }
  const serializeNode = serializer;

  // If baseline had fallbackFullSerialize or no blocks
  if (baseline.fallbackFullSerialize || !baseline.blocks || baseline.blocks.length === 0) {
    let fullText = '';
    const newBlocks: BlockRecord[] = [];
    let currentOffset = 0;

    for (let i = 0; i < pmDoc.childCount; i++) {
      const node = pmDoc.child(i);
      const gap = i === 0 ? '' : defaultNewline;
      const content = serializeNode(node, baseline.style);

      const blockStart = currentOffset + gap.length;
      const blockEnd = blockStart + content.length;

      newBlocks.push({
        node,
        start: blockStart,
        end: blockEnd,
        gapBefore: gap,
      });

      fullText += gap + content;
      currentOffset = blockEnd;
    }

    fullText += baseline.tail || '';
    const newBaseline: Baseline = {
      src: fullText,
      doc: pmDoc,
      blocks: newBlocks,
      tail: baseline.tail || '',
      style: baseline.style,
      fallbackFullSerialize: false,
    };

    return {
      text: fullText,
      newBaseline,
    };
  }

  // 2. F1 / F2 Block Matching Algorithm
  const newBlocks: BlockRecord[] = [];
  let resultText = '';
  let currentOffset = 0;
  let baselineIdx = 0;
  const maxSearchWindow = 50;

  for (let i = 0; i < pmDoc.childCount; i++) {
    const currNode = pmDoc.child(i);

    // Look forward in baseline blocks within search window
    let matchIdx = -1;
    const windowEnd = Math.min(baseline.blocks.length, baselineIdx + maxSearchWindow);

    for (let k = baselineIdx; k < windowEnd; k++) {
      const candidate = baseline.blocks[k];
      if (candidate.node && typeof candidate.node.eq === 'function') {
        if (candidate.node.eq(currNode) && candidate.node.type === currNode.type) {
          matchIdx = k;
          break;
        }
      }
    }

    if (matchIdx !== -1) {
      // Matched an unmodified block! (F1 guarantee)
      const matchedBlock = baseline.blocks[matchIdx];
      // Discard skipped baseline blocks (they were deleted)
      baselineIdx = matchIdx + 1;

      // Retain original gapBefore and original text slice byte-for-byte
      const gap = i === 0 && newBlocks.length === 0 ? matchedBlock.gapBefore : (matchedBlock.gapBefore || defaultNewline);
      const rawBlockText = baseline.src.slice(matchedBlock.start, matchedBlock.end);

      const start = currentOffset + gap.length;
      const end = start + rawBlockText.length;

      newBlocks.push({
        node: currNode,
        start,
        end,
        gapBefore: gap,
        children: matchedBlock.children,
      });

      resultText += gap + rawBlockText;
      currentOffset = end;
    } else {
      // Check if we can apply F2 to list or blockquote
      let handledF2 = false;
      if (
        baselineIdx < baseline.blocks.length &&
        baseline.blocks[baselineIdx].children &&
        baseline.blocks[baselineIdx].children!.length > 0 &&
        (currNode.type.name === 'bullet_list' ||
          currNode.type.name === 'ordered_list' ||
          currNode.type.name === 'blockquote')
      ) {
        const baseBlock = baseline.blocks[baselineIdx];
        // If types match, attempt child-level matching
        if (
          baseBlock.node &&
          (baseBlock.node.type === currNode.type || baseBlock.node.type.name === currNode.type.name)
        ) {
          const childRecords = baseBlock.children!;
          let childText = '';
          const newChildRecords: BlockRecord[] = [];
          let childOffset = 0;
          let childBaselineIdx = 0;
          let allChildrenHandled = true;

          for (let c = 0; c < currNode.childCount; c++) {
            const currChild = currNode.child(c);
            let childMatchIdx = -1;

            for (let ck = childBaselineIdx; ck < Math.min(childRecords.length, childBaselineIdx + 30); ck++) {
              if (childRecords[ck].node && childRecords[ck].node.eq && childRecords[ck].node.eq(currChild)) {
                childMatchIdx = ck;
                break;
              }
            }

            if (childMatchIdx !== -1) {
              const matchedChild = childRecords[childMatchIdx];
              childBaselineIdx = childMatchIdx + 1;
              const cGap = matchedChild.gapBefore;
              const cRaw = baseline.src.slice(matchedChild.start, matchedChild.end);
              const cStart = childOffset + cGap.length;
              const cEnd = cStart + cRaw.length;
              newChildRecords.push({
                node: currChild,
                start: cStart,
                end: cEnd,
                gapBefore: cGap,
              });
              childText += cGap + cRaw;
              childOffset = cEnd;
            } else {
              // Serialized child item
              const cGap = c === 0 ? '' : singleNewline;
              const serializedChild = serializeNode(currChild, baseline.style);
              const cStart = childOffset + cGap.length;
              const cEnd = cStart + serializedChild.length;
              newChildRecords.push({
                node: currChild,
                start: cStart,
                end: cEnd,
                gapBefore: cGap,
              });
              childText += cGap + serializedChild;
              childOffset = cEnd;
            }
          }

          if (allChildrenHandled && childText.length > 0) {
            baselineIdx++;
            const gap = i === 0 && newBlocks.length === 0 ? baseBlock.gapBefore : (baseBlock.gapBefore || defaultNewline);
            const start = currentOffset + gap.length;
            const end = start + childText.length;
            newBlocks.push({
              node: currNode,
              start,
              end,
              gapBefore: gap,
              children: newChildRecords,
            });
            resultText += gap + childText;
            currentOffset = end;
            handledF2 = true;
          }
        }
      }

      if (!handledF2) {
        // Block is new or modified; serialize it
        // Gap before: use gap of current baseline block if available, else default newline
        let gap = defaultNewline;
        if (i === 0 && newBlocks.length === 0) {
          gap = baseline.blocks[0] ? baseline.blocks[0].gapBefore : '';
        } else if (baselineIdx < baseline.blocks.length) {
          gap = baseline.blocks[baselineIdx].gapBefore || defaultNewline;
        }

        let serialized = '';
        try {
          serialized = serializeNode(currNode, baseline.style) || '';
        } catch (e) {
          if (baselineIdx < baseline.blocks.length) {
            const fallbackBlock = baseline.blocks[baselineIdx];
            serialized = baseline.src.slice(fallbackBlock.start, fallbackBlock.end);
          } else {
            throw e;
          }
        }
        const start = currentOffset + gap.length;
        const end = start + serialized.length;

        newBlocks.push({
          node: currNode,
          start,
          end,
          gapBefore: gap,
        });

        resultText += gap + serialized;
        currentOffset = end;

        // If baselineBlock at current position had same type/name or was consumed, advance it
        if (
          baselineIdx < baseline.blocks.length &&
          (baseline.blocks[baselineIdx].node?.type === currNode.type ||
            baseline.blocks[baselineIdx].node?.type?.name === currNode.type?.name)
        ) {
          baselineIdx++;
        }
      }
    }
  }

  // 3. Append original tail to preserve trailing whitespace/newlines
  const tail = baseline.tail !== undefined ? baseline.tail : '';
  resultText += tail;

  // 4. Handle mixed line endings unification when modified
  let eolUnified = false;
  if (baseline.style.eol === 'mixed') {
    // Unify to dominant EOL (defaulting to CRLF on Windows or based on count)
    const crlfCount = (resultText.match(/\r\n/g) || []).length;
    const lfOnlyCount = (resultText.replace(/\r\n/g, '').match(/\n/g) || []).length;
    const dominant = crlfCount >= lfOnlyCount ? '\r\n' : '\n';
    resultText = resultText.replace(/\r\n|\r|\n/g, dominant);
    eolUnified = true;
  }

  const newBaseline: Baseline = {
    src: resultText,
    doc: pmDoc,
    blocks: newBlocks,
    tail,
    style: baseline.style,
    fallbackFullSerialize: false,
  };

  return {
    text: resultText,
    newBaseline,
    eolUnified,
  };
}
