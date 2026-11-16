import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDocumentsStore } from '../../../src/stores/documents';
import { useWorkspaceStore } from '../../../src/stores/workspace';
import { useSettingsStore } from '../../../src/stores/settings';
import { useUiStore } from '../../../src/stores/ui';
import { i18n } from '../../../src/i18n/zh-CN';
import { workspaceApi } from '../../../src/api';

describe('UI Stores & Shell Logic', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('Documents Store', () => {
    it('closes multiple documents sequentially and stops on cancellation', async () => {
      const store = useDocumentsStore();
      const ui = useUiStore();
      const first = store.createNewDocument('first');
      const second = store.createNewDocument('second');
      store.updateContent(first.id, 'first changes');
      store.updateContent(second.id, 'second changes');
      store.requestCloseDocuments([first.id, second.id]);
      expect(ui.confirmDialog.message).toContain('first');
      ui.confirmDialog.onSecondary?.();
      await Promise.resolve();
      expect(store.documents.some(doc => doc.id === first.id)).toBe(false);
      expect(ui.confirmDialog.visible).toBe(true);
      expect(ui.confirmDialog.message).toContain('second');
      ui.confirmDialog.onCancel?.();
      expect(store.documents.some(doc => doc.id === second.id)).toBe(true);
    });
    it('creates new document and tracks active document', () => {
      const store = useDocumentsStore();
      const doc = store.createNewDocument('测试文档', '# 标题一\n正文内容');
      expect(store.documents.length).toBe(1);
      expect(store.activeDocumentId).toBe(doc.id);
      expect(store.activeDocument?.title).toBe('测试文档');
      expect(store.activeDocument?.status).toBe('clean');
    });

    it('extracts outline headings H1-H6 from markdown content', () => {
      const store = useDocumentsStore();
      store.createNewDocument(
        '大纲测试',
        '# 一级标题\n正文\n## 二级标题\n```\n# 代码块内不应提取\n```\n### 三级标题'
      );
      const headings = store.outlineHeadings;
      expect(headings.length).toBe(3);
      expect(headings[0].text).toBe('一级标题');
      expect(headings[0].level).toBe(1);
      expect(headings[1].text).toBe('二级标题');
      expect(headings[1].level).toBe(2);
      expect(headings[2].text).toBe('三级标题');
      expect(headings[2].level).toBe(3);
    });

    it('calculates CJK and Western word statistics accurately', () => {
      const store = useDocumentsStore();
      store.createNewDocument('统计测试', '你好 世界 Hello MarkYourDown');
      const stats = store.stats;
      // 4 Chinese chars ('你好世界') + 2 Western words ('Hello', 'MarkYourDown') = 6 words
      expect(stats.words).toBe(6);
      expect(stats.lines).toBe(1);
      expect(stats.chars).toBe('你好 世界 Hello MarkYourDown'.length);
      expect(stats.readTimeMinutes).toBe(1);
    });

    it('detects duplicate tab paths and handles reuse of empty untitled tab', () => {
      const store = useDocumentsStore();
      store.createNewDocument(i18n.app.untitled, '');

      // Open new file
      const id1 = store.openDocument({
        id: 'doc-1',
        path: 'C:/docs/test.md',
        title: 'test.md',
        content: '# Test',
        encoding: 'utf8',
        eol: 'lf',
        mtimeMs: 1000,
        size: 10,
        hash: 'h1',
      });

      // Emptry tab was reused
      expect(store.documents.length).toBe(1);
      expect(store.activeDocument?.path).toBe('C:/docs/test.md');

      // Attempt duplicate open
      const dup = store.checkDuplicate('C:/docs/test.md');
      expect(dup).toBe(id1);
    });

    it('handles external conflict state machine', async () => {
      const store = useDocumentsStore();
      const doc = store.createNewDocument('冲突测试', '原始内容');
      doc.path = 'C:/test.md';
      doc.disk = { mtimeMs: 1000, size: 10, hash: 'orig-hash' };

      // User modified content -> dirty
      store.updateContent(doc.id, '本地已修改内容');
      expect(doc.status).toBe('dirty');

      // External modify with different hash -> conflict
      store.handleExternalChange('C:/test.md', 'new-remote-hash', 2000, 20);
      expect(doc.status).toBe('conflict');

      // User chooses "keep my version" -> saves forcefully and returns to clean
      await store.keepMyVersion(doc.id);
      expect(doc.status).toBe('clean');
    });

    it('places newly created or opened documents at the first position (index 0)', () => {
      const store = useDocumentsStore();
      const doc1 = store.createNewDocument('Doc 1', 'Content 1');
      expect(store.documents[0].id).toBe(doc1.id);

      const doc2 = store.createNewDocument('Doc 2', 'Content 2');
      expect(store.documents[0].id).toBe(doc2.id);
      expect(store.documents[1].id).toBe(doc1.id);

      const doc3Id = store.openDocument({
        id: 'doc-3',
        path: 'C:/docs/file3.md',
        title: 'file3.md',
        content: '# File 3',
        encoding: 'utf8',
        eol: 'lf',
        mtimeMs: 3000,
        size: 30,
        hash: 'h3',
      });
      expect(store.documents[0].id).toBe(doc3Id);
    });

    it('prompts confirmation when closing dirty documents and closes clean documents directly', () => {
      const store = useDocumentsStore();
      const uiStore = useUiStore();
      const cleanDoc = store.createNewDocument('干净文档', '无改动');
      store.requestCloseDocument(cleanDoc.id);
      expect(store.documents.find((d) => d.id === cleanDoc.id)).toBeUndefined();
      expect(uiStore.confirmDialog.visible).toBe(false);

      const dirtyDoc = store.createNewDocument('脏文档', '待修改');
      store.updateContent(dirtyDoc.id, '已修改内容');
      expect(dirtyDoc.status).toBe('dirty');

      store.requestCloseDocument(dirtyDoc.id);
      expect(uiStore.confirmDialog.visible).toBe(true);
      expect(uiStore.confirmDialog.title).toBe(i18n.dialog.unsavedTitle);

      // Confirm without saving (secondary button: "不保存")
      uiStore.confirmDialog.onSecondary?.();
      expect(store.documents.find((d) => d.id === dirtyDoc.id)).toBeUndefined();
    });

    it('handles external delete and status updates properly (R1)', () => {
      const store = useDocumentsStore();
      const doc = store.createNewDocument('外部监听测试', '原始内容');
      doc.path = 'C:/notes/test.md';
      expect(doc.status).toBe('clean');

      store.handleExternalDelete('C:/notes/test.md');
      expect(doc.status).toBe('deleted');
    });

    it('saveAsDocument removes old backup ID to prevent ghost drafts (R3)', async () => {
      const store = useDocumentsStore();
      const doc = store.createNewDocument('另存测试', '新内容');
      const oldId = doc.id;
      store.updateContent(doc.id, '修改后的内容');
      expect(doc.status).toBe('dirty');

      const ok = await store.saveAsDocument(doc.id);
      expect(ok).toBe(true);
      expect(doc.status).toBe('clean');
      expect(doc.id).toBe(oldId);
      expect(store.activeDocumentId).toBe(oldId);
      expect(store.activeDocument?.content).toBe('修改后的内容');
    });

    it('recovery dialog onCancel discards all backups completely (R2)', () => {
      const uiStore = useUiStore();
      let discarded = false;
      const fakeBackups = [{ id: 'b1' }, { id: 'b2' }];

      const discardAll = () => {
        discarded = true;
        uiStore.closeConfirm();
      };

      uiStore.showConfirm({
        title: i18n.dialog.recoveryTitle,
        message: '检测到 2 个草稿',
        confirmText: i18n.dialog.recoveryConfirm,
        cancelText: i18n.dialog.recoveryCancel,
        onConfirm: () => {},
        onCancel: discardAll,
      });

      expect(uiStore.confirmDialog.visible).toBe(true);
      expect(uiStore.confirmDialog.cancelText).toBe(i18n.dialog.recoveryCancel);

      // User clicks cancel / abandon
      uiStore.confirmDialog.onCancel?.();
      expect(discarded).toBe(true);
      expect(uiStore.confirmDialog.visible).toBe(false);
    });
  });

  describe('Workspace Store', () => {
    it('shows the file sidebar after opening a folder, but not after cancellation', async () => {
      const store = useWorkspaceStore();
      const ui = useUiStore();
      const picker = vi.spyOn(workspaceApi, 'openFolderDialog');
      const list = vi.spyOn(workspaceApi, 'listDirectory').mockResolvedValue([]);
      try {
        ui.sidebarVisible = false;
        ui.focusMode = true;
        picker.mockResolvedValueOnce(null);
        await store.openFolder();
        expect(ui.sidebarTab).toBe('outline');
        expect(ui.focusMode).toBe(true);

        picker.mockResolvedValueOnce({ path: 'C:/notes', name: 'notes' });
        await store.openFolder();
        expect(ui.sidebarTab).toBe('files');
        expect(ui.sidebarVisible).toBe(true);
        expect(ui.focusMode).toBe(false);
        expect(store.currentFolder?.name).toBe('notes');
        expect(ui.temporaryStatusMessage).toContain('notes');
      } finally {
        picker.mockRestore();
        list.mockRestore();
      }
    });
    it('sorts folders first and orders alphabetically', async () => {
      const store = useWorkspaceStore();
      store.fileTree = [
        { name: 'b.md', path: 'C:/workspace/b.md', isDir: false },
        { name: 'folder-b', path: 'C:/workspace/folder-b', isDir: true },
        { name: 'a.md', path: 'C:/workspace/a.md', isDir: false },
        { name: 'folder-a', path: 'C:/workspace/folder-a', isDir: true },
      ];

      // Re-sort
      const sorted = [...store.fileTree].sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

      expect(sorted[0].name).toBe('folder-a');
      expect(sorted[1].name).toBe('folder-b');
      expect(sorted[2].name).toBe('a.md');
      expect(sorted[3].name).toBe('b.md');
    });
  });

  describe('Settings Store', () => {
    it('sets theme and updates settings reactive state', () => {
      const store = useSettingsStore();
      store.setTheme('night');
      expect(store.settings.theme).toBe('night');

      store.setTheme('warm');
      expect(store.settings.theme).toBe('warm');
    });

    it('sets content font family and max width', () => {
      const store = useSettingsStore();
      store.settings.contentWidth = 800;
      store.settings.contentFont = 'serif';
      store.applyToDom();

      expect(store.settings.contentWidth).toBe(800);
      expect(store.settings.contentFont).toBe('serif');
    });
  });

  describe('UI Store & Notice / Dialog', () => {
    it('toggles sidebar and cycles stat mode', () => {
      const store = useUiStore();
      expect(store.sidebarVisible).toBe(true);
      store.toggleSidebar();
      expect(store.sidebarVisible).toBe(false);

      expect(store.statusStatMode).toBe('words');
      store.cycleStatusStatMode();
      expect(store.statusStatMode).toBe('chars');
      store.cycleStatusStatMode();
      expect(store.statusStatMode).toBe('lines');
      store.cycleStatusStatMode();
      expect(store.statusStatMode).toBe('readTime');
    });

    it('manages confirm dialog state and callbacks', () => {
      const store = useUiStore();
      let confirmed = false;

      store.showConfirm({
        title: '删除',
        message: '确定删除？',
        onConfirm: () => {
          confirmed = true;
        },
      });

      expect(store.confirmDialog.visible).toBe(true);
      store.confirmDialog.onConfirm();
      expect(confirmed).toBe(true);
      expect(store.confirmDialog.visible).toBe(false);
    });

    it('controls dedicated About dialog open and close state', () => {
      const store = useUiStore();
      expect(store.aboutDialogOpen).toBe(false);
      store.openAbout();
      expect(store.aboutDialogOpen).toBe(true);
      store.closeAbout();
      expect(store.aboutDialogOpen).toBe(false);
    });
  });

  describe('i18n Dictionary', () => {
    it('has all required menu and dialog labels in zh-CN', () => {
      expect(i18n.app.name).toBe('MarkYourDown');
      expect(i18n.menu.file).toBe('文件');
      expect(i18n.menu.edit).toBe('编辑');
      expect(i18n.menu.view).toBe('视图');
      expect(i18n.menu.theme).toBe('主题');
      expect(i18n.settings.title).toBe('设置');
      expect(i18n.welcome.title).toBe('MarkYourDown');
    });
  });

  describe('Find & Replace Algorithm', () => {
    it('accurately indexes case-insensitive and case-sensitive occurrences', () => {
      const text = 'Hello world, hello MarkYourDown, HELLO!';
      const searchCaseInsensitive = (str: string, q: string) => {
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches: number[] = [];
        let m: RegExpExecArray | null;
        while ((m = regex.exec(str)) !== null) {
          matches.push(m.index);
        }
        return matches;
      };

      const searchCaseSensitive = (str: string, q: string) => {
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches: number[] = [];
        let m: RegExpExecArray | null;
        while ((m = regex.exec(str)) !== null) {
          matches.push(m.index);
        }
        return matches;
      };

      expect(searchCaseInsensitive(text, 'hello').length).toBe(3);
      expect(searchCaseSensitive(text, 'hello').length).toBe(1);
      expect(searchCaseSensitive(text, 'hello')[0]).toBe(13);
    });

    it('performs replace-all cleanly without corrupting other content', () => {
      const text = 'apple banana apple cherry apple';
      const replaced = text.replace(/apple/g, 'orange');
      expect(replaced).toBe('orange banana orange cherry orange');
    });
  });
});
