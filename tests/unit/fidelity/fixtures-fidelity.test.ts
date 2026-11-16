import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseToMdast, buildBaseline } from '../../../frontend/src/editor/fidelity/baseline';
import { serializeWithBaseline } from '../../../frontend/src/editor/fidelity/serializeWithBaseline';

describe('Fixtures Fidelity F0 Byte-Exact Verification', () => {
  const fixturesDir = path.resolve(__dirname, '../../fixtures');
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    it(`F0 byte-exact roundtrip for fixture: ${file}`, () => {
      const filePath = path.join(fixturesDir, file);
      const rawContent = fs.readFileSync(filePath, 'utf-8');

      // Parse to mdast
      const mdast = parseToMdast(rawContent);
      expect(mdast).toBeDefined();

      // Build baseline with mockDoc that matches mdast blocks
      const mockChildren = (mdast.children || []).map((c: any) => ({
        type: { name: c.type },
        textContent: rawContent.slice(c.position?.start?.offset || 0, c.position?.end?.offset || 0),
        childCount: 0,
        child: () => null,
        forEach: () => {},
        eq: (other: any) => other && other.type?.name === c.type,
      }));

      const mockDoc: any = {
        type: { name: 'doc' },
        childCount: mockChildren.length,
        child: (i: number) => mockChildren[i],
        forEach: (cb: any) => mockChildren.forEach(cb),
        eq: (other: any) => other && other.childCount === mockChildren.length,
      };

      const baseline = buildBaseline(rawContent, mockDoc);
      const result = serializeWithBaseline(mockDoc, baseline);

      // F0 Byte-exact guarantee:
      expect(result.text).toBe(rawContent);
      expect(Buffer.from(result.text).length).toBe(Buffer.from(rawContent).length);
    });
  }
});
