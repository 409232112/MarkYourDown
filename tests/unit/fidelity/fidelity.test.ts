import { describe, it, expect } from 'vitest';
import { detectStyleProfile } from '../../../frontend/src/editor/fidelity/styleProfile';
import { buildBaseline } from '../../../frontend/src/editor/fidelity/baseline';
import { serializeWithBaseline } from '../../../frontend/src/editor/fidelity/serializeWithBaseline';

interface MockBlockInput {
  type: string;
  text?: string;
  attrs?: Record<string, any>;
  children?: MockBlockInput[];
}

function createMockNode(b: MockBlockInput): any {
  const children = (b.children || []).map((c) => createMockNode(c));
  const textContent = b.text || children.map((c) => c.textContent).join('');

  return {
    type: { name: b.type },
    attrs: b.attrs || {},
    textContent,
    childCount: children.length,
    child: (idx: number) => children[idx] || null,
    forEach: (cb: (c: any) => void) => {
      if (b.text) cb({ isText: true, text: b.text });
      children.forEach(cb);
    },
    eq: (other: any) => {
      if (!other || other.type?.name !== b.type) return false;
      if (other.textContent !== textContent) return false;
      if (JSON.stringify(other.attrs) !== JSON.stringify(b.attrs || {})) return false;
      if (other.childCount !== children.length) return false;
      for (let i = 0; i < children.length; i++) {
        if (!children[i].eq(other.child(i))) return false;
      }
      return true;
    },
  };
}

function createMockDoc(blocks: MockBlockInput[]) {
  const pmBlocks = blocks.map((b) => createMockNode(b));

  const doc: any = {
    type: { name: 'doc' },
    childCount: pmBlocks.length,
    child: (i: number) => pmBlocks[i],
    forEach: (cb: (c: any) => void) => pmBlocks.forEach(cb),
    eq: (other: any) => {
      if (!other || other.childCount !== pmBlocks.length) return false;
      for (let i = 0; i < pmBlocks.length; i++) {
        if (!pmBlocks[i].eq(other.child(i))) return false;
      }
      return true;
    },
  };

  return doc;
}

describe('Fidelity Engine Tests (Spike S1, F0, F1, F2)', () => {
  describe('StyleProfile Detection', () => {
    it('detects bullet style, fence style, and eol correctly', () => {
      const src = '# Title\r\n\r\n* Item 1\r\n* Item 2\r\n\r\n```ts\r\nconst a = 1;\r\n```\r\n';
      const profile = detectStyleProfile(src);
      expect(profile.bullet).toBe('*');
      expect(profile.fence).toBe('`');
      expect(profile.eol).toBe('crlf');
    });

    it('detects dash bullets and tilde fences', () => {
      const src = '~~~python\nprint("hello")\n~~~\n\n- Apple\n- Banana\n';
      const profile = detectStyleProfile(src);
      expect(profile.bullet).toBe('-');
      expect(profile.fence).toBe('~');
      expect(profile.eol).toBe('lf');
    });
  });

  describe('F0: Unmodified Byte-Exact Roundtrip', () => {
    it('returns exact original bytes when document is untouched', () => {
      const src = '# Hello World\n\nThis is a paragraph with special spaces.   \n\n- List 1\n- List 2\n\n\n';
      const mockDoc = createMockDoc([
        { type: 'heading', text: 'Hello World', attrs: { level: 1 } },
        { type: 'paragraph', text: 'This is a paragraph with special spaces.   ' },
        {
          type: 'bullet_list',
          children: [
            { type: 'list_item', text: 'List 1' },
            { type: 'list_item', text: 'List 2' },
          ],
        },
      ]);

      const baseline = buildBaseline(src, mockDoc);
      expect(baseline.blocks.length).toBe(3);

      // Serialize without editing
      const result = serializeWithBaseline(mockDoc, baseline);
      expect(result.text).toBe(src);
      expect(result.text.length).toBe(src.length);
    });

    it('handles CRLF line endings byte-for-byte in F0', () => {
      const src = '# Windows CRLF\r\n\r\nParagraph 1\r\n\r\nParagraph 2\r\n';
      const mockDoc = createMockDoc([
        { type: 'heading', text: 'Windows CRLF', attrs: { level: 1 } },
        { type: 'paragraph', text: 'Paragraph 1' },
        { type: 'paragraph', text: 'Paragraph 2' },
      ]);

      const baseline = buildBaseline(src, mockDoc);
      const result = serializeWithBaseline(mockDoc, baseline);
      expect(result.text).toBe(src);
    });

    it('handles empty document cleanly', () => {
      const src = '';
      const mockDoc = createMockDoc([]);
      const baseline = buildBaseline(src, mockDoc);
      const result = serializeWithBaseline(mockDoc, baseline);
      expect(result.text).toBe('');
    });
  });

  describe('F1: Single Top-Level Block Edit Fidelity', () => {
    it('only serializes modified block while preserving other blocks byte-exact', () => {
      const src = '# First Heading\n\nOriginal paragraph 2.\n\n```js\nconsole.log(1);\n```\n';
      const origDoc = createMockDoc([
        { type: 'heading', text: 'First Heading', attrs: { level: 1 } },
        { type: 'paragraph', text: 'Original paragraph 2.' },
        { type: 'code_block', text: 'console.log(1);', attrs: { language: 'js' } },
      ]);

      const baseline = buildBaseline(src, origDoc);

      // Modify ONLY the second block (paragraph)
      const editedDoc = createMockDoc([
        { type: 'heading', text: 'First Heading', attrs: { level: 1 } },
        { type: 'paragraph', text: 'MODIFIED paragraph 2.' },
        { type: 'code_block', text: 'console.log(1);', attrs: { language: 'js' } },
      ]);

      const result = serializeWithBaseline(editedDoc, baseline);

      // Block 0 and Block 2 must remain identical in string output
      expect(result.text).toContain('# First Heading\n\n');
      expect(result.text).toContain('MODIFIED paragraph 2.');
      expect(result.text).toContain('\n\n```js\nconsole.log(1);\n```\n');
      // The original paragraph must not exist
      expect(result.text).not.toContain('Original paragraph 2.');
    });

    it('preserves surrounding blocks when a new block is inserted', () => {
      const src = '# Top\n\n# Bottom\n';
      const origDoc = createMockDoc([
        { type: 'heading', text: 'Top', attrs: { level: 1 } },
        { type: 'heading', text: 'Bottom', attrs: { level: 1 } },
      ]);

      const baseline = buildBaseline(src, origDoc);

      // Insert middle paragraph
      const newDoc = createMockDoc([
        { type: 'heading', text: 'Top', attrs: { level: 1 } },
        { type: 'paragraph', text: 'Inserted middle paragraph' },
        { type: 'heading', text: 'Bottom', attrs: { level: 1 } },
      ]);

      const result = serializeWithBaseline(newDoc, baseline);
      expect(result.text).toContain('# Top');
      expect(result.text).toContain('Inserted middle paragraph');
      expect(result.text).toContain('# Bottom');
    });
  });

  describe('F2: List Child Item Fidelity', () => {
    it('preserves untouched list items when one item is changed', () => {
      const src = '- Alpha\n- Beta item original\n- Gamma\n';
      const origDoc = createMockDoc([
        {
          type: 'bullet_list',
          children: [
            { type: 'list_item', text: 'Alpha' },
            { type: 'list_item', text: 'Beta item original' },
            { type: 'list_item', text: 'Gamma' },
          ],
        },
      ]);

      const baseline = buildBaseline(src, origDoc);
      expect(baseline.blocks[0].children?.length).toBe(3);

      // Modify only second list item
      const editedDoc = createMockDoc([
        {
          type: 'bullet_list',
          children: [
            { type: 'list_item', text: 'Alpha' },
            { type: 'list_item', text: 'Beta item EDITED' },
            { type: 'list_item', text: 'Gamma' },
          ],
        },
      ]);

      const result = serializeWithBaseline(editedDoc, baseline, (node) => {
        return `- ${node.textContent}`;
      });

      expect(result.text).toContain('- Alpha');
      expect(result.text).toContain('Beta item EDITED');
      expect(result.text).toContain('- Gamma');
      expect(result.text).not.toContain('Beta item original');
    });
  });
});
