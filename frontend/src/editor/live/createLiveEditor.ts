import { Editor, rootCtx, defaultValueCtx, editorViewCtx, prosePluginsCtx, serializerCtx, schemaCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import type { Node as PMNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Plugin, PluginKey, Selection } from '@milkdown/kit/prose/state';

import type { Baseline } from '../../shared/types';
import { buildBaseline } from '../fidelity/baseline';
import { serializeWithBaseline } from '../fidelity/serializeWithBaseline';
import { globalImeGuard } from '../sync/ime';

import { createCodeBlockPlugin, type CodeBlockOptions } from './plugins/codeBlockPlugin';
import { createTablePlugin } from './plugins/tablePlugin';
import { createTaskListPlugin } from './plugins/taskListPlugin';
import { createCalloutPlugin } from './plugins/calloutPlugin';
import { createEditorKeymapPlugin, type EditorKeymapCallbacks } from './plugins/keymapPlugin';
import { createFrontmatterPlugin } from './plugins/frontmatterPlugin';
import { createImagePlugin } from './plugins/imagePlugin';
import { createSearchPlugin } from './plugins/searchPlugin';

export interface LiveEditorOptions extends EditorKeymapCallbacks, CodeBlockOptions {
  initialText?: string;
  docPath?: string | null;
  getDocPath?: () => string | null | undefined;
  readOnly?: boolean;
  onChange?: (markdown: string) => void;
  onDocChange?: (doc: PMNode) => void;
  onCursorChange?: (pos: number) => void;
  onBaselineUpdate?: (baseline: Baseline) => void;
}

export interface LiveEditorInstance {
  editor: Editor;
  getView: () => EditorView | null;
  getPmDoc: () => PMNode | null;
  getPmPos: () => number;
  setPmPos: (pos: number) => void;
  getBaseline: () => Baseline;
  setBaseline: (baseline: Baseline) => void;
  getMarkdown: () => string;
  setDocPath: (path: string | null) => void;
  focus: () => void;
  destroy: () => Promise<void>;
}

export async function createLiveEditor(
  container: HTMLElement,
  options: LiveEditorOptions = {}
): Promise<LiveEditorInstance> {
  const initialText = options.initialText || '';
  let currentDocPath = options.docPath || null;
  let currentBaseline: Baseline = buildBaseline(initialText);
  let detachIme: (() => void) | null = null;

  let serializeNode: ((node: any) => string) | null = null;

  const docUpdatePlugin = new Plugin({
    key: new PluginKey('myd-doc-update-listener'),
    view: () => ({
      update(view, prevState) {
        if (!view.state.doc.eq(prevState.doc)) {
          const nextDoc = view.state.doc;
          options.onDocChange?.(nextDoc);
          if (options.onChange && serializeNode) {
            const { text, newBaseline } = serializeWithBaseline(nextDoc, currentBaseline, serializeNode);
            currentBaseline = newBaseline;
            options.onBaselineUpdate?.(newBaseline);
            options.onChange(text);
          }
        }
      },
    }),
  });

  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, container);
      ctx.set(defaultValueCtx, initialText);

      // Register custom ProseMirror plugins
      ctx.update(prosePluginsCtx, (prev) => [
        ...prev,
        docUpdatePlugin,
        createImagePlugin({ getDocPath: () => options.getDocPath?.() || currentDocPath }),
        createCodeBlockPlugin({ stripShellDollar: options.stripShellDollar }),
        createTablePlugin(),
        createTaskListPlugin(),
        createCalloutPlugin(),
        createEditorKeymapPlugin(options),
        createFrontmatterPlugin(),
        createSearchPlugin(),
      ]);

      // Setup selection listener
      ctx.get(listenerCtx).selectionUpdated((innerCtx) => {
        try {
          const view = innerCtx.get(editorViewCtx);
          if (view && options.onCursorChange) {
            options.onCursorChange(view.state.selection.from);
          }
        } catch {
          // view may not be ready during init
        }
      });
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener);

  await editor.create();

  // Attach IME guard to container
  detachIme = globalImeGuard.attach(container);

  // Initialize serializer and baseline with created PM document
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const serializer = ctx.get(serializerCtx);
    const schema = ctx.get(schemaCtx);

    serializeNode = (node: any) => {
      if (!node) return '';
      try {
        const wrapped = schema.topNodeType.create(null, node);
        const md = serializer(wrapped);
        return md.replace(/\n+$/, '');
      } catch (err: any) {
        console.error('Milkdown block serialization error:', err);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('editor:serialize-error', {
              detail: { message: `块序列化异常: ${err?.message || '未知错误'}` },
            })
          );
        }
        throw err;
      }
    };

    if (view && view.state) {
      currentBaseline = buildBaseline(initialText, view.state.doc);
      options.onBaselineUpdate?.(currentBaseline);
    }
  });

  return {
    editor,
    getView: () => {
      let v: EditorView | null = null;
      editor.action((ctx) => {
        v = ctx.get(editorViewCtx);
      });
      return v;
    },
    getPmDoc: () => {
      let doc: PMNode | null = null;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (view) doc = view.state.doc;
      });
      return doc;
    },
    getPmPos: () => {
      let pos = 0;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (view) pos = view.state.selection.from;
      });
      return pos;
    },
    setPmPos: (pos: number) => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (view) {
          const safePos = Math.max(0, Math.min(view.state.doc.content.size, pos));
          const sel = Selection.near(view.state.doc.resolve(safePos));
          view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
        }
      });
    },
    getBaseline: () => currentBaseline,
    setBaseline: (b: Baseline) => {
      currentBaseline = b;
    },
    getMarkdown: () => {
      let md = initialText;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (view && serializeNode) {
          const { text, newBaseline } = serializeWithBaseline(view.state.doc, currentBaseline, serializeNode);
          currentBaseline = newBaseline;
          md = text;
        }
      });
      return md;
    },
    setDocPath: (path: string | null) => {
      currentDocPath = path;
    },
    focus: () => {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (view) {
          view.focus();
          if (!view.hasFocus()) {
            (view.dom as HTMLElement).focus();
          }
          try {
            const sel = Selection.atStart(view.state.doc);
            view.dispatch(view.state.tr.setSelection(sel));
          } catch {
            // ignore
          }
        }
      });
    },
    destroy: async () => {
      detachIme?.();
      await editor.destroy();
    },
  };
}
