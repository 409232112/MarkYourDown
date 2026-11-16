// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import FilePanel from '../../../src/components/FilePanel.vue';
import { useDocumentsStore } from '../../../src/stores/documents';
import { fileApi } from '../../../src/api';

describe('file panel document selection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('expands nested directories and reveals their files', async () => {
    vi.spyOn(fileApi, 'getRecentFiles').mockResolvedValue([]);
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useWorkspaceStore } = await import('../../../src/stores/workspace');
    const workspace = useWorkspaceStore();
    workspace.currentFolder = { path: 'C:/root', name: 'root' };
    workspace.fileTree = [
      { name: 'folder', path: 'C:/root/folder', isDir: true, children: [{ name: 'nested.md', path: 'C:/root/folder/nested.md', isDir: false }] },
      { name: 'empty', path: 'C:/root/empty', isDir: true, children: [{ name: 'deep', path: 'C:/root/empty/deep', isDir: true, children: [] }] },
      { name: 'txt-folder', path: 'C:/root/txt-folder', isDir: true, children: [{ name: 'notes.txt', path: 'C:/root/txt-folder/notes.txt', isDir: false }] },
    ];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const app = createApp(FilePanel).use(pinia);
    app.mount(container);
    try {
      (container.querySelector('[title="切换为树状视图"]') as HTMLElement).click();
      await nextTick();
      expect(container.querySelector('.file-tree')?.textContent).not.toContain('empty');
      expect(container.querySelector('.file-tree')?.textContent).toContain('txt-folder');
      expect(container.querySelector('.file-tree')?.textContent).not.toContain('nested.md');
      (container.querySelector('.tree-node') as HTMLElement).click();
      await nextTick();
      expect(container.querySelector('.file-tree')?.textContent).toContain('nested.md');
    } finally {
      app.unmount();
      container.remove();
    }
  });

  it('keeps similar and same-named files separate and selects by full path', async () => {
    vi.spyOn(fileApi, 'getRecentFiles').mockResolvedValue([]);
    const pinia = createPinia();
    setActivePinia(pinia);
    const docs = useDocumentsStore();
    const add = (id: string, path: string) => docs.openDocument({
      id, path, title: path.split('/').pop()!, content: '# 文档',
      encoding: 'utf8', eol: 'lf', mtimeMs: 1, size: 1, hash: id,
    });
    add('original', 'C:/a/报告.md');
    add('copy', 'C:/a/报告 - 副本.md');
    add('other', 'C:/b/报告.md');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const app = createApp(FilePanel).use(pinia);
    app.mount(container);
    try {
      await nextTick();
      const cards = () => Array.from(container.querySelectorAll<HTMLElement>('.doc-card'));
      expect(cards()).toHaveLength(3);
      const copy = cards().find(el => el.textContent?.includes('副本'))!;
      copy.click();
      await nextTick();
      expect(docs.activeDocumentId).toBe('copy');
      expect(copy.classList.contains('active')).toBe(true);
      const other = cards().find(el => el.querySelector('.card-folder')?.textContent === 'b')!;
      other.click();
      await nextTick();
      expect(docs.activeDocumentId).toBe('other');
      expect(cards().filter(el => el.classList.contains('active'))).toHaveLength(1);
      expect(cards().map(el => el.querySelector('.card-folder')?.textContent)).toEqual(['a', 'a', 'b']);
    } finally {
      app.unmount();
      container.remove();
    }
  });
});
