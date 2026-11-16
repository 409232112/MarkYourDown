import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import type { Node as PMNode } from '@milkdown/kit/prose/model';

export class FrontmatterNodeView implements NodeView {
  public dom: HTMLElement;
  public contentDOM?: HTMLElement;
  private isCollapsed = true;
  private bodyEl!: HTMLElement;
  private toggleBtn!: HTMLElement;

  constructor(private node: PMNode, private view: EditorView, private getPos: () => number | undefined) {
    this.dom = document.createElement('div');
    this.dom.className = 'myd-frontmatter-card myd-frontmatter-collapsed';

    const header = document.createElement('div');
    header.className = 'myd-frontmatter-header';

    const title = document.createElement('span');
    title.className = 'myd-frontmatter-title';
    title.textContent = '元数据';

    this.toggleBtn = document.createElement('span');
    this.toggleBtn.className = 'myd-frontmatter-toggle';
    this.toggleBtn.textContent = '展开';

    header.appendChild(title);
    header.appendChild(this.toggleBtn);
    header.addEventListener('click', () => this.toggleCollapse());

    this.bodyEl = document.createElement('pre');
    this.bodyEl.className = 'myd-frontmatter-body';
    this.contentDOM = document.createElement('code');
    this.bodyEl.appendChild(this.contentDOM);

    this.dom.appendChild(header);
    this.dom.appendChild(this.bodyEl);
  }

  private toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
    if (this.isCollapsed) {
      this.dom.classList.add('myd-frontmatter-collapsed');
      this.toggleBtn.textContent = '展开';
    } else {
      this.dom.classList.remove('myd-frontmatter-collapsed');
      this.toggleBtn.textContent = '折叠';
    }
  }

  public update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    return true;
  }
}

export function createFrontmatterPlugin(): Plugin {
  return new Plugin({
    key: new PluginKey('myd-frontmatter'),
    props: {
      nodeViews: {
        frontmatter(node, view, getPos) {
          return new FrontmatterNodeView(node, view, getPos as () => number | undefined);
        },
        yaml(node, view, getPos) {
          return new FrontmatterNodeView(node, view, getPos as () => number | undefined);
        },
      },
    },
  });
}
