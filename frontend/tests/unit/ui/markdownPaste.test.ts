// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createLiveEditor } from '../../../src/editor/live/createLiveEditor';

describe('Markdown paste in live editor', () => {
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
