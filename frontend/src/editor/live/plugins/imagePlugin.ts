import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import type { Node as PMNode } from '@milkdown/kit/prose/model';
import { fileApi } from '../../../api';

export interface ImagePluginOptions {
  getDocPath?: () => string | null | undefined;
}

function isRelativeImagePath(src: string): boolean {
  if (!src) return false;
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('/local-image/')
  ) {
    return false;
  }
  return true;
}

export class ImageView implements NodeView {
  public dom: HTMLElement;
  private img: HTMLImageElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: () => number | undefined;
  private options: ImagePluginOptions;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined, options: ImagePluginOptions = {}) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.options = options;

    this.dom = document.createElement('span');
    this.dom.className = 'myd-image-wrapper';

    this.img = document.createElement('img');
    this.img.className = 'myd-image';
    this.img.alt = node.attrs.alt || '';
    if (node.attrs.title) {
      this.img.title = node.attrs.title;
    }

    this.loadImage(node.attrs.src || '');

    // Image click: preview modal zoom (Chapter 5.4)
    this.img.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openPreviewModal();
    });

    this.dom.appendChild(this.img);
  }

  private async loadImage(rawSrc: string) {
    if (!rawSrc) return;

    if (isRelativeImagePath(rawSrc)) {
      const docPath = this.options.getDocPath?.();
      if (docPath) {
        try {
          const tokenUrl = await fileApi.getImageToken(docPath, rawSrc);
          if (tokenUrl) {
            this.img.src = tokenUrl;
            return;
          }
        } catch (e) {
          console.warn('Failed to resolve relative image token:', e);
        }
      }
    }

    this.img.src = rawSrc;
  }

  private openPreviewModal() {
    window.dispatchEvent(
      new CustomEvent('image:preview', {
        detail: {
          src: this.img.src,
          alt: this.img.alt,
          title: this.img.title || this.img.alt,
        },
      })
    );
  }

  public update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    if (node.attrs.src !== this.node.attrs.src) {
      this.loadImage(node.attrs.src || '');
    }
    this.img.alt = node.attrs.alt || '';
    if (node.attrs.title) {
      this.img.title = node.attrs.title;
    }
    this.node = node;
    return true;
  }
}

export function createImagePlugin(options: ImagePluginOptions = {}): Plugin {
  return new Plugin({
    key: new PluginKey('myd-image-loader'),
    props: {
      nodeViews: {
        image(node, view, getPos) {
          return new ImageView(node, view, getPos as () => number | undefined, options);
        },
      },
    },
  });
}
