// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createLiveEditor } from '../../../src/editor/live/createLiveEditor';
import { insertStructuredAction } from '../../../src/editor/live/insertAction';

describe('structured menu insertion', () => {
  for (const [action, type] of [['table', 'table'], ['task-list', 'bullet_list']]) {
    it(`inserts ${action} as structure`, async () => {
      const host = document.createElement('div');
      document.body.append(host);
      const editor = await createLiveEditor(host);
      try {
        expect(insertStructuredAction(editor, action)).toBe(true);
        const types: string[] = [];
        editor.getPmDoc()!.descendants(node => { types.push(node.type.name); });
        expect(types).toContain(type);
        expect(editor.getMarkdown()).not.toContain('\\|');
      } finally { await editor.destroy(); host.remove(); }
    });
  }
  it('inserts a real hyperlink mark', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const editor = await createLiveEditor(host);
    try {
      insertStructuredAction(editor, 'link');
      expect(editor.getMarkdown()).toContain('[链接文本](https://)');
    } finally { await editor.destroy(); host.remove(); }
  });
});
