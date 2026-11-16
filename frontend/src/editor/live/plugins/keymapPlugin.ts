import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { setBlockType, toggleMark, wrapIn } from '@milkdown/kit/prose/commands';
import { wrapInList } from '@milkdown/kit/prose/schema-list';
import { globalImeGuard } from '../../sync/ime';

export interface EditorKeymapCallbacks {
  onToggleMode?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onFind?: () => void;
  onReplace?: () => void;
}

export function createEditorKeymapPlugin(callbacks: EditorKeymapCallbacks = {}): Plugin {
  return new Plugin({
    key: new PluginKey('myd-editor-keymap'),
    props: {
      handleKeyDown(view, event) {
        // While composing with Chinese IME, completely pause custom shortcuts
        if (globalImeGuard.composing) {
          return false;
        }

        const isCtrl = event.ctrlKey || event.metaKey;
        const key = event.key;
        const state = view.state;
        const schema = state.schema;

        // Mode switch: Ctrl + /
        if (isCtrl && key === '/') {
          event.preventDefault();
          event.stopPropagation();
          callbacks.onToggleMode?.();
          return true;
        }

        // Save: Ctrl + S
        if (isCtrl && !event.shiftKey && (key === 's' || key === 'S')) {
          event.preventDefault();
          event.stopPropagation();
          callbacks.onSave?.();
          return true;
        }

        // Save As: Ctrl + Shift + S
        if (isCtrl && event.shiftKey && (key === 's' || key === 'S')) {
          event.preventDefault();
          event.stopPropagation();
          callbacks.onSaveAs?.();
          return true;
        }

        // Find: Ctrl + F
        if (isCtrl && !event.shiftKey && (key === 'f' || key === 'F')) {
          event.preventDefault();
          event.stopPropagation();
          callbacks.onFind?.();
          return true;
        }

        // Replace: Ctrl + H
        if (isCtrl && !event.shiftKey && (key === 'h' || key === 'H')) {
          event.preventDefault();
          event.stopPropagation();
          callbacks.onReplace?.();
          return true;
        }

        // Headings 1~6: Ctrl + 1..6
        if (isCtrl && !event.shiftKey && ['1', '2', '3', '4', '5', '6'].includes(key)) {
          const level = parseInt(key, 10);
          const headingNode = schema.nodes.heading;
          if (headingNode) {
            event.preventDefault();
            return setBlockType(headingNode, { level })(state, view.dispatch);
          }
        }

        // Paragraph: Ctrl + 0
        if (isCtrl && !event.shiftKey && key === '0') {
          const paragraphNode = schema.nodes.paragraph;
          if (paragraphNode) {
            event.preventDefault();
            return setBlockType(paragraphNode)(state, view.dispatch);
          }
        }

        // Upgrade / Downgrade heading: Ctrl + = / Ctrl + -
        if (isCtrl && (key === '=' || key === '+')) {
          const { $from } = state.selection;
          const node = $from.parent;
          if (node.type.name === 'heading') {
            event.preventDefault();
            const currentLevel = node.attrs.level || 1;
            const newLevel = Math.max(1, currentLevel - 1);
            return setBlockType(schema.nodes.heading, { level: newLevel })(state, view.dispatch);
          }
        }
        if (isCtrl && (key === '-' || key === '_')) {
          const { $from } = state.selection;
          const node = $from.parent;
          if (node.type.name === 'heading') {
            event.preventDefault();
            const currentLevel = node.attrs.level || 1;
            const newLevel = Math.min(6, currentLevel + 1);
            return setBlockType(schema.nodes.heading, { level: newLevel })(state, view.dispatch);
          }
        }

        // Bold: Ctrl + B
        if (isCtrl && !event.shiftKey && (key === 'b' || key === 'B')) {
          if (schema.marks.strong) {
            event.preventDefault();
            return toggleMark(schema.marks.strong)(state, view.dispatch);
          }
        }

        // Italic: Ctrl + I
        if (isCtrl && !event.shiftKey && (key === 'i' || key === 'I')) {
          if (schema.marks.em) {
            event.preventDefault();
            return toggleMark(schema.marks.em)(state, view.dispatch);
          }
        }

        // Strikethrough: Alt + Shift + 5
        if (event.altKey && event.shiftKey && key === '5') {
          if (schema.marks.strike_through) {
            event.preventDefault();
            return toggleMark(schema.marks.strike_through)(state, view.dispatch);
          }
        }

        // Inline Code: Ctrl + Shift + `
        if (isCtrl && event.shiftKey && (key === '`' || key === '~')) {
          if (schema.marks.code_inline) {
            event.preventDefault();
            return toggleMark(schema.marks.code_inline)(state, view.dispatch);
          }
        }

        // Blockquote: Ctrl + Shift + Q
        if (isCtrl && event.shiftKey && (key === 'q' || key === 'Q')) {
          if (schema.nodes.blockquote) {
            event.preventDefault();
            return wrapIn(schema.nodes.blockquote)(state, view.dispatch);
          }
        }

        // Ordered List: Ctrl + Shift + [
        if (isCtrl && event.shiftKey && key === '{') {
          if (schema.nodes.ordered_list) {
            event.preventDefault();
            return wrapInList(schema.nodes.ordered_list)(state, view.dispatch);
          }
        }

        // Unordered List: Ctrl + Shift + ]
        if (isCtrl && event.shiftKey && key === '}') {
          if (schema.nodes.bullet_list) {
            event.preventDefault();
            return wrapInList(schema.nodes.bullet_list)(state, view.dispatch);
          }
        }

        // Code block: Ctrl + Shift + K
        if (isCtrl && event.shiftKey && (key === 'k' || key === 'K')) {
          const fenceNode = schema.nodes.fence || schema.nodes.code_block;
          if (fenceNode) {
            event.preventDefault();
            return setBlockType(fenceNode)(state, view.dispatch);
          }
        }

        return false;
      },
    },
  });
}
