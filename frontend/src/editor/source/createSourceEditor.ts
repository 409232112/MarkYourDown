import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';

export interface SourceEditorOptions {
  initialText?: string;
  initialOffset?: number;
  readOnly?: boolean;
  showLineNumbers?: boolean;
  wordWrap?: boolean;
  onChange?: (val: string) => void;
  onCursorChange?: (offset: number) => void;
  onToggleMode?: () => void;
  onSave?: () => void;
}

export interface SourceEditorInstance {
  view: EditorView;
  getValue: () => string;
  setValue: (text: string) => void;
  getCursor: () => number;
  setCursor: (offset: number) => void;
  getScrollTop: () => number;
  setScrollTop: (top: number) => void;
  focus: () => void;
  destroy: () => void;
}

// Custom theme for CodeMirror 6 adhering to Claude Design Language & tokens.css
const baseTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '15px',
    fontFamily: 'JetBrains Mono, SFMono-Regular, Consolas, Menlo, monospace',
    backgroundColor: 'var(--bg, #FAF9F5)',
    color: 'var(--text, #2B2A26)',
  },
  '.cm-content': {
    padding: '48px clamp(24px, 4vw, 56px) 40vh clamp(24px, 4vw, 56px)',
    maxWidth: 'var(--content-width, 1000px)',
    margin: '0 auto',
    caretColor: 'var(--accent, #C96442)',
    lineHeight: '1.7',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent, #C96442)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--accent-soft, rgba(201, 100, 66, 0.15)) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--hover, rgba(31, 30, 29, 0.03))',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-side, #F0EEE6)',
    color: 'var(--text-3, #9C9A92)',
    borderRight: '1px solid var(--border, #E6E3D8)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--border, #E6E3D8)',
    color: 'var(--text, #2B2A26)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--accent-soft, rgba(201, 100, 66, 0.25))',
    outline: '1px solid var(--accent, #C96442)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--accent, #C96442)',
    color: '#FAF9F5',
  },
});

export function createSourceEditor(
  container: HTMLElement,
  options: SourceEditorOptions = {}
): SourceEditorInstance {
  const customKeymaps = keymap.of([
    {
      key: 'Mod-/',
      run: () => {
        if (options.onToggleMode) {
          options.onToggleMode();
          return true;
        }
        return false;
      },
    },
    {
      key: 'Mod-s',
      run: () => {
        if (options.onSave) {
          options.onSave();
          return true;
        }
        return false;
      },
    },
    indentWithTab,
    ...searchKeymap,
    ...historyKeymap,
    ...defaultKeymap,
  ]);

  const extensions: Extension[] = [
    highlightSpecialChars(),
    history(), // CodeMirror 6 independent history
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    markdown(),
    baseTheme,
    customKeymaps,
  ];

  if (options.showLineNumbers) {
    extensions.push(lineNumbers(), highlightActiveLineGutter());
  }

  if (options.wordWrap !== false) {
    extensions.push(EditorView.lineWrapping);
  }

  if (options.readOnly) {
    extensions.push(EditorState.readOnly.of(true));
  }

  // Listener for doc updates & cursor moves
  extensions.push(
    EditorView.updateListener.of((update) => {
      if (update.docChanged && options.onChange) {
        options.onChange(update.state.doc.toString());
      }
      if (update.selectionSet && options.onCursorChange) {
        const head = update.state.selection.main.head;
        options.onCursorChange(head);
      }
    })
  );

  const startDoc = options.initialText || '';
  const initialOffset = Math.min(startDoc.length, Math.max(0, options.initialOffset || 0));

  const state = EditorState.create({
    doc: startDoc,
    selection: { anchor: initialOffset, head: initialOffset },
    extensions,
  });

  const view = new EditorView({
    state,
    parent: container,
  });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue: (text: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
    getCursor: () => view.state.selection.main.head,
    setCursor: (offset: number) => {
      const safeOffset = Math.min(view.state.doc.length, Math.max(0, offset));
      view.dispatch({
        selection: { anchor: safeOffset, head: safeOffset },
        scrollIntoView: true,
      });
    },
    getScrollTop: () => view.scrollDOM.scrollTop,
    setScrollTop: (top: number) => {
      view.scrollDOM.scrollTop = top;
    },
    focus: () => {
      view.focus();
    },
    destroy: () => {
      view.destroy();
    },
  };
}
