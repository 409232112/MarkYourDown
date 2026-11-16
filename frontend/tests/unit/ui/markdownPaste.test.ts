// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createLiveEditor } from '../../../src/editor/live/createLiveEditor';
import { setActivePinia, createPinia } from 'pinia';
import { useDocumentsStore } from '../../../src/stores/documents';

describe('Markdown paste in live editor', () => {
  it('keeps an opened document clean until its content changes', async () => {
    setActivePinia(createPinia());
    const store = useDocumentsStore();
    const id = store.openDocument({ id: 'opened', path: 'C:/notes/opened.md', title: 'opened.md', content: '# 标题\n\n| A | B |\n| --- | --- |\n| 一 | 二 |\n', encoding: 'utf8', eol: 'lf', mtimeMs: 1, size: 1, hash: 'h' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = await createLiveEditor(container, {
      initialText: store.activeDocument!.content,
      onChange: text => store.updateContent(id, text),
    });
    try {
      expect(store.activeDocument?.status).toBe('clean');
      editor.focus();
      expect(store.activeDocument?.status).toBe('clean');
      const view = editor.getView()!;
      view.dispatch(view.state.tr.insertText('新内容'));
      expect(store.activeDocument?.status).toBe('dirty');
    } finally {
      await editor.destroy();
      container.remove();
    }
  });
  it('converts a pasted Markdown table and keeps it in saved Markdown', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = await createLiveEditor(container);
    try {
      const view = editor.getView()!;
      const text = '| 操作 | 快捷键 |\n| --- | --- |\n| 新建 / 打开 / 保存 | Ctrl+N / Ctrl+O / Ctrl+S |\n| 查找 / 替换 | Ctrl+F / Ctrl+H |';
      const event = { clipboardData: { getData: (type: string) => type === 'text/plain' ? text : '' } } as ClipboardEvent;
      let handled = false;
      view.someProp('handlePaste', handler => {
        handled = !!handler(view, event, undefined as any);
        return handled;
      });
      expect(handled).toBe(true);
      expect(view.state.doc.toJSON()).toMatchObject({ content: expect.arrayContaining([expect.objectContaining({ type: 'table' })]) });
      expect(editor.getMarkdown()).toContain('Ctrl+N / Ctrl+O / Ctrl+S');
    } finally {
      await editor.destroy();
      container.remove();
    }
  });
});
