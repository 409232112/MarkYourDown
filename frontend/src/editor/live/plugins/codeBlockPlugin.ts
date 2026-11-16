import { Plugin, PluginKey, Selection, type EditorState, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import type { Node as PMNode } from '@milkdown/kit/prose/model';

export const CODE_LANGUAGES = [
  'text',
  'javascript',
  'typescript',
  'python',
  'bash',
  'shell',
  'powershell',
  'go',
  'rust',
  'c',
  'cpp',
  'csharp',
  'java',
  'html',
  'css',
  'scss',
  'json',
  'yaml',
  'toml',
  'sql',
  'markdown',
  'diff',
  'dockerfile',
  'latex',
];

export interface CodeBlockOptions {
  stripShellDollar?: boolean;
}

export class CodeBlockView implements NodeView {
  public dom: HTMLElement;
  public contentDOM: HTMLElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: () => number | undefined;
  private options: CodeBlockOptions;

  private langEl!: HTMLElement;
  private copyBtn!: HTMLElement;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined, options: CodeBlockOptions = {}) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.options = options;

    // Outer wrapper
    this.dom = document.createElement('div');
    this.dom.className = 'myd-code-block-wrapper';

    // Header bar
    const header = document.createElement('div');
    header.className = 'myd-code-block-header';

    // Language label
    this.langEl = document.createElement('span');
    this.langEl.className = 'myd-code-block-lang';
    this.updateLangText();
    this.langEl.addEventListener('click', (e) => this.onLangClick(e));

    // Copy text button
    this.copyBtn = document.createElement('span');
    this.copyBtn.className = 'myd-code-block-copy';
    this.copyBtn.textContent = '复制';
    this.copyBtn.addEventListener('click', (e) => this.onCopyClick(e));

    header.appendChild(this.langEl);
    header.appendChild(this.copyBtn);
    this.dom.appendChild(header);

    // Code container
    const pre = document.createElement('pre');
    pre.className = 'myd-code-block-pre';
    this.contentDOM = document.createElement('code');
    this.contentDOM.className = 'myd-code-block-code';
    pre.appendChild(this.contentDOM);
    this.dom.appendChild(pre);
  }

  private updateLangText() {
    const rawLang = this.node.attrs.language || this.node.attrs.params || '';
    this.langEl.textContent = rawLang ? rawLang.trim() : '纯文本';
  }

  private onCopyClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    let text = this.node.textContent || '';
    const rawLang = (this.node.attrs.language || this.node.attrs.params || '').toLowerCase();
    if (this.options.stripShellDollar && ['bash', 'shell', 'sh', 'console', 'zsh'].includes(rawLang)) {
      text = text.replace(/^\$ /gm, '');
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.copyBtn.textContent = '已复制';
        setTimeout(() => {
          this.copyBtn.textContent = '复制';
        }, 1500);
      });
    }
  }

  private onLangClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Show inline language select picker
    const existingPicker = document.querySelector('.myd-code-lang-picker');
    if (existingPicker) existingPicker.remove();

    const picker = document.createElement('div');
    picker.className = 'myd-code-lang-picker';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '搜索语言...';
    input.className = 'myd-code-lang-input';

    const list = document.createElement('div');
    list.className = 'myd-code-lang-list';

    const renderList = (filter: string) => {
      list.innerHTML = '';
      const filtered = CODE_LANGUAGES.filter((l) => l.toLowerCase().includes(filter.toLowerCase()));
      for (const lang of filtered) {
        const item = document.createElement('div');
        item.className = 'myd-code-lang-item';
        item.textContent = lang;
        item.addEventListener('click', () => {
          this.setLanguage(lang === 'text' ? '' : lang);
          picker.remove();
        });
        list.appendChild(item);
      }
    };

    input.addEventListener('input', () => renderList(input.value));
    renderList('');

    picker.appendChild(input);
    picker.appendChild(list);

    // Position relative to langEl
    const rect = this.langEl.getBoundingClientRect();
    picker.style.position = 'absolute';
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.bottom + 4}px`;
    picker.style.zIndex = '1000';

    document.body.appendChild(picker);
    input.focus();

    const onDocClick = (evt: MouseEvent) => {
      if (!picker.contains(evt.target as Node)) {
        picker.remove();
        document.removeEventListener('click', onDocClick);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', onDocClick);
    }, 10);
  }

  private setLanguage(language: string) {
    const pos = this.getPos();
    if (pos === undefined) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      language,
      params: language,
    });
    this.view.dispatch(tr);
  }

  public update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.updateLangText();
    return true;
  }

  public ignoreMutation(mutation: any): boolean {
    if (!this.contentDOM) return true;
    if (mutation.type === 'selection') return false;
    return !this.contentDOM.contains(mutation.target);
  }
}

export function createCodeBlockPlugin(options: CodeBlockOptions = {}): Plugin {
  return new Plugin({
    key: new PluginKey('myd-code-block'),
    props: {
      nodeViews: {
        fence(node, view, getPos) {
          return new CodeBlockView(node, view, getPos as () => number | undefined, options);
        },
        code_block(node, view, getPos) {
          return new CodeBlockView(node, view, getPos as () => number | undefined, options);
        },
      },
      handleKeyDown(view, event) {
        const { state, dispatch } = view;
        const { selection } = state;
        const { $from } = selection;

        // Check if inside a code block
        const parent = $from.parent;
        if (parent.type.name !== 'fence' && parent.type.name !== 'code_block') {
          return false;
        }

        // Tab: indent 2 spaces
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          dispatch(state.tr.insertText('  '));
          return true;
        }

        // Shift+Tab: outdent 2 spaces if possible
        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          const lineStart = $from.start();
          const textBeforeInLine = state.doc.textBetween(lineStart, $from.pos);
          if (textBeforeInLine.endsWith('  ')) {
            dispatch(state.tr.delete($from.pos - 2, $from.pos));
            return true;
          }
          return true;
        }

        // Ctrl+Enter: Exit code block and create a paragraph after
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          const blockEnd = $from.after();
          const tr = state.tr.insert(blockEnd, state.schema.nodes.paragraph.create());
          const newPos = blockEnd + 1;
          tr.setSelection(Selection.near(tr.doc.resolve(newPos)));
          dispatch(tr.scrollIntoView());
          return true;
        }

        // Double Enter at end of code block: exit code block
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
          const text = parent.textContent;
          if (text.endsWith('\n') && $from.parentOffset === text.length) {
            event.preventDefault();
            const blockEnd = $from.after();
            const tr = state.tr
              .delete($from.pos - 1, $from.pos)
              .insert(blockEnd - 1, state.schema.nodes.paragraph.create());
            const newPos = blockEnd;
            tr.setSelection(Selection.near(tr.doc.resolve(newPos)));
            dispatch(tr.scrollIntoView());
            return true;
          }
        }

        return false;
      },
    },
  });
}
