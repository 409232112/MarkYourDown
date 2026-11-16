import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

export const searchPluginKey = new PluginKey('myd-search-plugin');

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchState {
  query: string;
  matchCase: boolean;
  matches: SearchMatch[];
  activeIndex: number;
}

export function createSearchPlugin(): Plugin {
  return new Plugin({
    key: searchPluginKey,
    state: {
      init(): SearchState {
        return {
          query: '',
          matchCase: false,
          matches: [],
          activeIndex: -1,
        };
      },
      apply(tr, prevState): SearchState {
        const meta = tr.getMeta(searchPluginKey);
        if (meta !== undefined) {
          return meta;
        }
        if (!prevState.query || prevState.matches.length === 0) {
          return prevState;
        }
        if (tr.docChanged) {
          const updatedMatches: SearchMatch[] = [];
          for (const m of prevState.matches) {
            const mappedFrom = tr.mapping.map(m.from);
            const mappedTo = tr.mapping.map(m.to);
            if (mappedFrom < mappedTo) {
              updatedMatches.push({ from: mappedFrom, to: mappedTo });
            }
          }
          return {
            ...prevState,
            matches: updatedMatches,
          };
        }
        return prevState;
      },
    },
    props: {
      decorations(state) {
        const s = searchPluginKey.getState(state) as SearchState | undefined;
        if (!s || !s.query || s.matches.length === 0) {
          return DecorationSet.empty;
        }
        const decos: Decoration[] = [];
        for (let i = 0; i < s.matches.length; i++) {
          const match = s.matches[i];
          const isActive = i === s.activeIndex;
          decos.push(
            Decoration.inline(match.from, match.to, {
              class: isActive ? 'myd-search-match myd-search-match-active' : 'myd-search-match',
            })
          );
        }
        return DecorationSet.create(state.doc, decos);
      },
    },
  });
}
