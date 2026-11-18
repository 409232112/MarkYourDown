import { parserCtx } from '@milkdown/kit/core';
import { Slice } from '@milkdown/kit/prose/model';
import type { LiveEditorInstance } from './createLiveEditor';

/** Insert parsed block structure instead of escaped Markdown text nodes. */
export function insertStructuredAction(instance: LiveEditorInstance, action: string): boolean {
  if (!['table', 'link', 'task-list'].includes(action)) return false;
  const view = instance.getView();
  if (!view) return true;
  const { state } = view;
  if (action === 'link') {
    const mark = state.schema.marks.link.create({ href: 'https://' });
    const { from, to, empty } = state.selection;
    view.dispatch(empty
      ? state.tr.replaceSelectionWith(state.schema.text('链接文本', [mark]), false)
      : state.tr.addMark(from, to, mark));
  } else {
    const selected = state.doc.textBetween(state.selection.from, state.selection.to, ' ');
    const markdown = action === 'table'
      ? '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n'
      : `- [ ] ${selected || '待办事项'}\n`;
    instance.editor.action(ctx => {
      const parsed = ctx.get(parserCtx)(markdown);
      if (parsed) view.dispatch(state.tr.replaceSelection(new Slice(parsed.content, 0, 0)).scrollIntoView());
    });
  }
  view.focus();
  return true;
}
