// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { createLiveEditor } from '../../../src/editor/live/createLiveEditor';
import { createSourceEditor } from '../../../src/editor/source/createSourceEditor';

it('blocks programmatic document changes while allowing selection in both preview editors', async () => {
  const host = document.createElement('div'); document.body.appendChild(host);
  const live = await createLiveEditor(host, { initialText: 'Hello', readOnly: true });
  const view = live.getView()!;
  const before = view.state.doc.toJSON();
  view.dispatch(view.state.tr.insertText('X', 1));
  expect(view.state.doc.toJSON()).toEqual(before);
  expect(view.editable).toBe(false);
  await live.destroy();
  const source = createSourceEditor(host, { initialText: 'Hello', readOnly: true });
  source.view.dispatch({ changes: { from: 0, insert: 'X' } });
  expect(source.getValue()).toBe('Hello');
  source.setCursor(2);
  expect(source.getCursor()).toBe(2);
  source.destroy(); host.remove();
});
