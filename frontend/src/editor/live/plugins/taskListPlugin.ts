import { Plugin, PluginKey } from '@milkdown/kit/prose/state';

export function createTaskListPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('myd-task-list-interactive'),
    props: {
      handleClickOn(view, _pos, node, nodePos, event) {
        const target = event.target as HTMLElement | null;
        if (!target) return false;

        // Check if user clicked a task item checkbox
        if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
          // If the node at nodePos is task_list_item or child has checkbox
          if (node.type.name === 'task_list_item' || node.type.name === 'list_item') {
            const currentChecked = Boolean(node.attrs.checked);
            const tr = view.state.tr.setNodeMarkup(nodePos, undefined, {
              ...node.attrs,
              checked: !currentChecked,
            });
            view.dispatch(tr);
            return true;
          }

          // Or find closest task node from pos
          const resolved = view.state.doc.resolve(nodePos);
          for (let d = resolved.depth; d > 0; d--) {
            const parent = resolved.node(d);
            if (parent.type.name === 'task_list_item' || parent.type.name === 'list_item') {
              const pos = resolved.before(d);
              const currentChecked = Boolean(parent.attrs.checked);
              const tr = view.state.tr.setNodeMarkup(pos, undefined, {
                ...parent.attrs,
                checked: !currentChecked,
              });
              view.dispatch(tr);
              return true;
            }
          }
        }
        return false;
      },
    },
  });
}
