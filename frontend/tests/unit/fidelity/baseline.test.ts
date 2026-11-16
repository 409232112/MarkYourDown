import { describe, it, expect } from 'vitest';
import { buildBaseline } from '../../../src/editor/fidelity/baseline';
import { serializeWithBaseline } from '../../../src/editor/fidelity/serializeWithBaseline';
import { detectStyleProfile } from '../../../src/editor/fidelity/styleProfile';

describe('Fidelity Baseline Engine', () => {
  it('detects style profile accurately', () => {
    const src = `---
title: Test
---

* item 1
* item 2

1) first
2) second

~~~ts
console.log("hello");
~~~

_italic_ and __bold__

***
`;
    const style = detectStyleProfile(src);
    expect(style.bullet).toBe('*');
    expect(style.orderedDelim).toBe(')');
    expect(style.fence).toBe('~');
    expect(style.emphasis).toBe('_');
    expect(style.strong).toBe('__');
    expect(style.rule).toBe('*');
  });

  it('preserves byte-exact F0 on unmodified content', () => {
    const sample = `# Title

First paragraph with some text.

- List item 1
- List item 2

\`\`\`javascript
const x = 42;
\`\`\`

> Blockquote with trailing spaces   

End of document.
`;
    // Mock PM Doc that implements .eq() and has childCount
    const mockNodes = [
      { type: { name: 'heading' }, textContent: 'Title', eq: (o: any) => o.textContent === 'Title' },
      { type: { name: 'paragraph' }, textContent: 'First paragraph with some text.', eq: (o: any) => o.textContent === 'First paragraph with some text.' },
      { type: { name: 'bullet_list' }, textContent: 'List item 1\nList item 2', eq: (o: any) => o.textContent === 'List item 1\nList item 2' },
      { type: { name: 'code_block' }, textContent: 'const x = 42;', eq: (o: any) => o.textContent === 'const x = 42;' },
      { type: { name: 'blockquote' }, textContent: 'Blockquote with trailing spaces   ', eq: (o: any) => o.textContent === 'Blockquote with trailing spaces   ' },
      { type: { name: 'paragraph' }, textContent: 'End of document.', eq: (o: any) => o.textContent === 'End of document.' },
    ];

    const mockDoc = {
      childCount: mockNodes.length,
      child: (i: number) => mockNodes[i],
      eq: (other: any) => other === mockDoc,
    };

    const baseline = buildBaseline(sample, mockDoc);
    expect(baseline.blocks.length).toBe(6);
    expect(baseline.fallbackFullSerialize).toBe(false);

    // Save unmodified
    const result = serializeWithBaseline(mockDoc, baseline);
    expect(result.text).toBe(sample); // Byte-for-byte identical!
  });

  it('guarantees F1: modifies only target block, other blocks byte-exact', () => {
    const sample = `# Heading 1

First paragraph with **bold** and *italic*.

- Item A
- Item B

Final paragraph.
`;
    const mockNodes = [
      { type: { name: 'heading' }, textContent: 'Heading 1', eq(o: any) { return o.textContent === this.textContent; } },
      { type: { name: 'paragraph' }, textContent: 'First paragraph with **bold** and *italic*.', eq(o: any) { return o.textContent === this.textContent; } },
      { type: { name: 'bullet_list' }, textContent: 'Item A\nItem B', eq(o: any) { return o.textContent === this.textContent; } },
      { type: { name: 'paragraph' }, textContent: 'Final paragraph.', eq(o: any) { return o.textContent === this.textContent; } },
    ];

    const mockDoc = {
      childCount: mockNodes.length,
      child: (i: number) => mockNodes[i],
      eq: (other: any) => other === mockDoc,
    };

    const baseline = buildBaseline(sample, mockDoc);

    // Now simulate modifying ONLY the second block (first paragraph)
    const modifiedNodes = [
      mockNodes[0], // unchanged
      { type: { name: 'paragraph' }, textContent: 'Modified second paragraph!', eq(o: any) { return o.textContent === this.textContent; } },
      mockNodes[2], // unchanged
      mockNodes[3], // unchanged
    ];

    const modifiedDoc = {
      childCount: modifiedNodes.length,
      child: (i: number) => modifiedNodes[i],
      eq: (other: any) => other === modifiedDoc,
    };

    const result = serializeWithBaseline(modifiedDoc, baseline, (node) => node.textContent);

    // Block 0 should be exact
    expect(result.text.startsWith('# Heading 1\n\n')).toBe(true);
    // Block 1 modified
    expect(result.text.includes('Modified second paragraph!')).toBe(true);
    // Block 2 and 3 must be byte-exact preserved
    expect(result.text.includes('\n\n- Item A\n- Item B\n\nFinal paragraph.\n')).toBe(true);
  });

  it('guarantees F2: modifies one list item while keeping sibling item byte-exact', () => {
    const sample = `- [x] Task 1
- [ ] Task 2
- [ ] Task 3
`;
    const childNodes = [
      { type: { name: 'list_item' }, textContent: '[x] Task 1', eq(o: any) { return o.textContent === this.textContent; } },
      { type: { name: 'list_item' }, textContent: '[ ] Task 2', eq(o: any) { return o.textContent === this.textContent; } },
      { type: { name: 'list_item' }, textContent: '[ ] Task 3', eq(o: any) { return o.textContent === this.textContent; } },
    ];

    const listNode = {
      type: { name: 'bullet_list' },
      childCount: childNodes.length,
      child: (i: number) => childNodes[i],
      eq(o: any) { return o === this; },
    };

    const doc = {
      childCount: 1,
      child: () => listNode,
      eq: (o: any) => o === doc,
    };

    const baseline = buildBaseline(sample, doc);
    expect(baseline.blocks[0].children?.length).toBe(3);

    // Modify ONLY Task 2 to [x] Task 2 (toggle checkbox)
    const modifiedChildNodes = [
      childNodes[0], // unchanged
      { type: { name: 'list_item' }, textContent: '- [x] Task 2', eq(o: any) { return o.textContent === this.textContent; } },
      childNodes[2], // unchanged
    ];

    const modifiedListNode = {
      type: { name: 'bullet_list' },
      childCount: modifiedChildNodes.length,
      child: (i: number) => modifiedChildNodes[i],
      eq: () => false,
    };

    const modifiedDoc = {
      childCount: 1,
      child: () => modifiedListNode,
      eq: () => false,
    };

    const result = serializeWithBaseline(modifiedDoc, baseline, (node) => node.textContent);
    // Task 1 and Task 3 are byte-exact slices of original source
    expect(result.text).toBe(`- [x] Task 1
- [x] Task 2
- [ ] Task 3
`);
  });

  it('falls back to baseline block slice when serializer throws instead of dropping format', () => {
    const sample = `# Heading 1

Some **bold** paragraph.
`;
    const nodes = [
      { type: { name: 'heading' }, textContent: 'Heading 1', eq: () => false },
      { type: { name: 'paragraph' }, textContent: 'Some bold paragraph.', eq: () => false },
    ];
    const doc = {
      childCount: nodes.length,
      child: (i: number) => nodes[i],
      eq: () => false,
    };
    const baseline = buildBaseline(sample, doc);

    // Serializer throws on block
    const throwingSerializer = () => {
      throw new Error('Serialization failed unexpectedly');
    };

    const res = serializeWithBaseline(doc, baseline, throwingSerializer);
    // Should preserve original baseline text slice
    expect(res.text).toContain('# Heading 1');
    expect(res.text).toContain('Some **bold** paragraph.');
  });
});
