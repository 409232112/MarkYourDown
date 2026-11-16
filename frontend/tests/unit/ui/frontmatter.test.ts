// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createLiveEditor } from '../../../src/editor/live/createLiveEditor';

describe('YAML front matter in live editor', () => {
  it('displays arbitrary metadata as a text block and preserves it when editing', async () => {
    const source = '---\nname: example\ndescription: >-\n  First line,\n  second line.\n---\n\n# Heading\n\nBody.\n';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = await createLiveEditor(container, { initialText: source });
    try {
      const view = editor.getView()!;
      expect(view.state.doc.firstChild?.type.name).toBe('frontmatter');
      expect(container.querySelector('pre.myd-frontmatter')?.textContent).toContain('description: >-');
      expect(view.state.doc.child(1).type.name).toBe('heading');
      expect(editor.getMarkdown()).toBe(source);
      view.dispatch(view.state.tr.insertText('X', view.state.doc.content.size - 2));
      expect(editor.getMarkdown()).toContain('---\nname: example\ndescription: >-\n  First line,\n  second line.\n---');
      view.dispatch(view.state.tr.insertText('new-', 1));
      expect(editor.getMarkdown()).toContain('new-name: example');
      expect(editor.getMarkdown()).toMatch(/^---\n/);
    } finally {
      await editor.destroy();
      container.remove();
    }
  });

  it('keeps an ordinary horizontal rule outside the document start', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = await createLiveEditor(container, { initialText: 'Before\n\n---\n\nAfter' });
    try {
      expect(container.querySelector('pre.myd-frontmatter')).toBeNull();
      expect(editor.getView()!.state.doc.toJSON().content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'hr' })]));
    } finally {
      await editor.destroy();
      container.remove();
    }
  });

  it('retains CRLF front matter when changing the document body', async () => {
    const source = '---\r\ntitle: 示例\r\ncustom: yes\r\n---\r\n\r\n# 正文\r\n';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = await createLiveEditor(container, { initialText: source });
    try {
      expect(editor.getMarkdown()).toBe(source);
      const view = editor.getView()!;
      view.dispatch(view.state.tr.insertText('新', view.state.doc.content.size - 1));
      expect(editor.getMarkdown()).toContain('---\r\ntitle: 示例\r\ncustom: yes\r\n---');
    } finally {
      await editor.destroy();
      container.remove();
    }
  });
});
