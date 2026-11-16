import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

export interface CalloutMeta {
  type: string;
  label: string;
  color: string;
}

export const CALLOUT_TYPES: Record<string, CalloutMeta> = {
  NOTE: { type: 'note', label: '注意', color: '#4C6E96' },
  TIP: { type: 'tip', label: '提示', color: '#5E7F49' },
  IMPORTANT: { type: 'important', label: '重要', color: '#7A5C8E' },
  WARNING: { type: 'warning', label: '警告', color: '#A7731F' },
  CAUTION: { type: 'caution', label: '小心', color: '#B5553A' },
};

const CALLOUT_REGEX = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i;

export function createCalloutPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('myd-callout-blocks'),
    props: {
      decorations(state) {
        const { doc } = state;
        const decorations: Decoration[] = [];

        doc.descendants((node, pos) => {
          if (node.type.name === 'blockquote') {
            const firstChild = node.firstChild;
            if (firstChild && firstChild.isTextblock) {
              const text = firstChild.textContent;
              const match = text.match(CALLOUT_REGEX);
              if (match) {
                const calloutKey = match[1].toUpperCase();
                const meta = CALLOUT_TYPES[calloutKey];
                if (meta) {
                  // Blockquote node decoration
                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: `myd-callout myd-callout-${meta.type}`,
                      style: `--callout-color: ${meta.color};`,
                    })
                  );

                  // Header widget decoration right before the first paragraph or inside
                  const pPos = pos + 1; // start of blockquote content
                  const headerWidget = Decoration.widget(pPos, () => {
                    const header = document.createElement('div');
                    header.className = 'myd-callout-label';
                    header.textContent = meta.label;
                    return header;
                  });
                  decorations.push(headerWidget);
                }
              }
            }
          }
        });

        return DecorationSet.create(doc, decorations);
      },
    },
  });
}
