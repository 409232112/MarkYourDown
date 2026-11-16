// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { mapLiveToSource, mapSourceToLive } from '../../../src/editor/sync/cursorMap';
import { ImeGuard } from '../../../src/editor/sync/ime';
import { ModeSwitchCoordinator } from '../../../src/editor/sync/modeSwitch';
import { buildBaseline } from '../../../src/editor/fidelity/baseline';
import type { DocState } from '../../../src/shared/types';

describe('Sync & Mode Switching', () => {
  it('maps cursor accurately between Live PM and Source CM', () => {
    const src = `# Hello World

This is a test paragraph with detailed text content.

- Bullet 1
- Bullet 2
`;
    const mockNodes = [
      {
        nodeSize: 15,
        textContent: 'Hello World',
        content: { size: 11 },
        type: { name: 'heading' },
        eq: () => true,
      },
      {
        nodeSize: 55,
        textContent: 'This is a test paragraph with detailed text content.',
        content: { size: 53 },
        type: { name: 'paragraph' },
        eq: () => true,
      },
      {
        nodeSize: 22,
        textContent: 'Bullet 1\nBullet 2',
        content: { size: 20 },
        type: { name: 'bullet_list' },
        eq: () => true,
      },
    ];

    const mockDoc = {
      childCount: mockNodes.length,
      child: (i: number) => mockNodes[i],
      eq: () => true,
    };

    const baseline = buildBaseline(src, mockDoc);

    // Live pos inside second block: pos = 15 (block 0 size) + 10 = 25
    const liveToSource = mapLiveToSource(25, mockDoc, baseline);
    expect(liveToSource.blockIndex).toBe(1);
    expect(liveToSource.offset).toBeGreaterThan(15);

    // Reverse mapping
    const sourceToLive = mapSourceToLive(liveToSource.offset, baseline, mockDoc);
    expect(sourceToLive.blockIndex).toBe(1);
    expect(sourceToLive.pmPos).toBeGreaterThanOrEqual(15);
  });

  it('IME guard defers actions during composition and flushes upon compositionend', () => {
    const guard = new ImeGuard();
    const dom = document.createElement('div');
    guard.attach(dom);

    let executed = false;
    const action = () => {
      executed = true;
    };

    // Simulate composition start
    dom.dispatchEvent(new Event('compositionstart'));
    expect(guard.composing).toBe(true);

    // Attempt action
    const immediate = guard.executeOrDefer(action);
    expect(immediate).toBe(false);
    expect(executed).toBe(false);

    // Simulate composition end
    dom.dispatchEvent(new Event('compositionend'));
    expect(guard.composing).toBe(false);
    expect(executed).toBe(true);
  });

  it('orchestrates Live to Source mode switch with status message', async () => {
    const statusMessages: string[] = [];
    const coordinator = new ModeSwitchCoordinator({
      onStatusMessage: (msg) => statusMessages.push(msg),
    });

    const src = '# Document Title\n\nSome body text here.\n';
    const mockNodes = [
      { nodeSize: 18, textContent: 'Document Title', content: { size: 14 }, type: { name: 'heading' }, eq: () => true },
      { nodeSize: 23, textContent: 'Some body text here.', content: { size: 20 }, type: { name: 'paragraph' }, eq: () => true },
    ];
    const mockDoc = {
      childCount: mockNodes.length,
      child: (i: number) => mockNodes[i],
      eq: (o: any) => o === mockDoc,
    };
    const baseline = buildBaseline(src, mockDoc);

    const docState: DocState = {
      id: 'doc-1',
      path: 'test.md',
      title: 'test.md',
      mode: 'live',
      eol: 'lf',
      encoding: 'utf8',
      status: 'clean',
    };

    let destroyedLive = false;
    let initedSourceText = '';

    const res = await coordinator.switchLiveToSource({
      pmDoc: mockDoc,
      pmPos: 5,
      baseline,
      docState,
      onDestroyLive: () => { destroyedLive = true; },
      onInitSource: (text, _offset) => { initedSourceText = text; },
    });

    expect(res).not.toBeNull();
    expect(destroyedLive).toBe(true);
    expect(initedSourceText).toBe(src);
    expect(docState.mode).toBe('source');
    expect(statusMessages).toContain('已切换到源码模式');
  });
});
