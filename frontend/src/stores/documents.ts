import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { fileApi, backupApi, type FileInfo } from '../api';
import { i18n } from '../i18n/zh-CN';
import { useUiStore } from './ui';

export interface DocState {
  id: string;
  path: string | null;
  title: string;
  mode: 'live' | 'source';
  eol: 'crlf' | 'lf' | 'mixed';
  encoding: 'utf8' | 'utf8bom' | 'gbk' | string;
  disk?: { mtimeMs: number; size: number; hash: string };
  status: 'clean' | 'dirty' | 'conflict' | 'deleted' | 'saveFailed';
  content: string;
  cursor?: unknown;
  scrollTop?: number;
  saveErrorMessage?: string;
}

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  line: number;
}

export const useDocumentsStore = defineStore('documents', () => {
  const documents = ref<DocState[]>([]);
  const activeDocumentId = ref<string | null>(null);

  const activeDocument = computed(() => {
    return documents.value.find((d) => d.id === activeDocumentId.value) || null;
  });

  // Extract H1~H6 headings from markdown content
  const outlineHeadings = computed<HeadingItem[]>(() => {
    if (!activeDocument.value) return [];
    const lines = activeDocument.value.content.split(/\r?\n/);
    const headings: HeadingItem[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim().replace(/^[-•·*]\s*/, '').replace(/[#*`_~\[\]]/g, '');
        headings.push({
          id: `heading-${i}-${headings.length}`,
          level,
          text,
          line: i + 1,
        });
      }
    }
    return headings;
  });

  // Calculate statistics (word count, chars, lines, reading time)
  const stats = computed(() => {
    if (!activeDocument.value) {
      return { words: 0, chars: 0, lines: 0, readTimeMinutes: 0 };
    }
    const text = activeDocument.value.content;
    const lines = text ? text.split(/\r?\n/).length : 0;
    const chars = text.length;

    // Chinese characters count + Western words count
    const cjkMatches = text.match(/[\u4e00-\u9fa5]/g);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;
    const westernMatches = text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[a-zA-Z0-9_\-]+/g);
    const westernCount = westernMatches ? westernMatches.length : 0;
    const words = cjkCount + westernCount;

    // Reading speed: ~300 words/min
    const readTimeMinutes = Math.max(1, Math.ceil(words / 300));

    return { words, chars, lines, readTimeMinutes };
  });

  function createNewDocument(title?: string, content = ''): DocState {
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newDoc: DocState = {
      id,
      path: null,
      title: title || i18n.app.untitled,
      mode: 'live',
      eol: 'crlf',
      encoding: 'utf8',
      status: 'clean',
      content,
    };
    documents.value.unshift(newDoc);
    activeDocumentId.value = id;
    return newDoc;
  }

  function checkDuplicate(path: string): string | null {
    if (!path) return null;
    const norm = path.replace(/\\/g, '/').toLowerCase();
    const existing = documents.value.find((d) => {
      if (!d.path) return false;
      const dNorm = d.path.replace(/\\/g, '/').toLowerCase();
      return dNorm === norm;
    });
    return existing ? existing.id : null;
  }

  function openDocument(info: FileInfo) {
    // Check if already open
    const existingId = checkDuplicate(info.path);
    if (existingId) {
      activeDocumentId.value = existingId;
      return existingId;
    }

    // Reuse empty untitled clean document if single and untouched
    if (
      documents.value.length === 1 &&
      documents.value[0].path === null &&
      documents.value[0].status === 'clean' &&
      documents.value[0].content === ''
    ) {
      const target = documents.value[0];
      target.id = info.id || `doc-${Date.now()}`;
      target.path = info.path;
      target.title = info.title;
      target.content = info.content;
      target.encoding = info.encoding;
      target.eol = info.eol;
      target.disk = { mtimeMs: info.mtimeMs, size: info.size, hash: info.hash };
      target.status = 'clean';
      activeDocumentId.value = target.id;
      fileApi.addRecentFile({ path: info.path, title: info.title, accessedAt: Date.now() });
      return target.id;
    }

    const doc: DocState = {
      id: info.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      path: info.path,
      title: info.title,
      mode: 'live',
      eol: info.eol,
      encoding: info.encoding,
      disk: { mtimeMs: info.mtimeMs, size: info.size, hash: info.hash },
      status: 'clean',
      content: info.content,
    };
    documents.value.unshift(doc);
    activeDocumentId.value = doc.id;
    fileApi.addRecentFile({ path: info.path, title: info.title, accessedAt: Date.now() });
    return doc.id;
  }

  async function openFileFromPath(path: string): Promise<string | null> {
    const dup = checkDuplicate(path);
    if (dup) {
      activeDocumentId.value = dup;
      return dup;
    }
    const info = await fileApi.openFile(path);
    if (info) {
      return openDocument(info);
    }
    return null;
  }

  function switchDocument(id: string) {
    if (documents.value.some((d) => d.id === id)) {
      activeDocumentId.value = id;
    }
  }

  const backupTimers = new Map<string, any>();
  function scheduleDraftBackup(doc: DocState) {
    if (backupTimers.has(doc.id)) {
      clearTimeout(backupTimers.get(doc.id));
    }
    const timer = setTimeout(() => {
      backupTimers.delete(doc.id);
      if (doc.status === 'dirty') {
        backupApi.saveBackup({
          id: doc.id,
          path: doc.path || '',
          title: doc.title,
          content: doc.content,
          eol: doc.eol,
          encoding: doc.encoding,
          baseHash: doc.disk?.hash || '',
        });
      }
    }, 3000);
    backupTimers.set(doc.id, timer);
  }

  function closeDocument(id: string) {
    if (backupTimers.has(id)) {
      clearTimeout(backupTimers.get(id));
      backupTimers.delete(id);
    }
    backupApi.removeBackup(id);

    const idx = documents.value.findIndex((d) => d.id === id);
    if (idx === -1) return;

    documents.value.splice(idx, 1);
    if (activeDocumentId.value === id) {
      if (documents.value.length > 0) {
        // Switch to the previous tab or the first tab
        const nextIdx = Math.max(0, idx - 1);
        activeDocumentId.value = documents.value[nextIdx].id;
      } else {
        activeDocumentId.value = null;
      }
    }
  }

  function requestCloseDocument(id: string, onClosed?: () => void) {
    const doc = documents.value.find((d) => d.id === id);
    if (!doc) return;

    if (doc.status === 'dirty') {
      const uiStore = useUiStore();
      uiStore.showConfirm({
        title: i18n.dialog.unsavedTitle,
        message: i18n.dialog.unsavedMessage.replace('{title}', doc.title),
        confirmText: i18n.dialog.save,
        secondaryText: i18n.dialog.dontSave,
        cancelText: i18n.dialog.cancel,
        onConfirm: async () => {
          const ok = await saveDocument(id);
          if (ok) {
            closeDocument(id);
            onClosed?.();
          }
        },
        onSecondary: () => {
          closeDocument(id);
          onClosed?.();
        },
        onCancel: () => {
          // Keep document open
        },
      });
    } else {
      closeDocument(id);
      onClosed?.();
    }
  }

  function updateContent(id: string, content: string) {
    const doc = documents.value.find((d) => d.id === id);
    if (!doc) return;
    if (doc.content === content) return;
    doc.content = content;
    if (doc.status === 'clean') {
      doc.status = 'dirty';
    }
    scheduleDraftBackup(doc);
  }

  function markEdited(id: string) {
    const doc = documents.value.find((d) => d.id === id);
    if (doc?.status === 'clean') doc.status = 'dirty';
  }

  let isSaving = false;
  async function saveDocument(id: string, force = false): Promise<boolean> {
    if (isSaving) return false;
    isSaving = true;
    try {
      const doc = documents.value.find((d) => d.id === id);
      if (!doc) return false;

      if (!doc.path) {
        return await saveAsDocument(id);
      }

      const savedContent = doc.content;
      const res = await fileApi.saveFile(
        doc.id,
        doc.path,
        savedContent,
        force ? undefined : doc.disk?.hash,
        doc.encoding,
        doc.eol,
        force
      );
      if (res.success) {
        doc.status = doc.content === savedContent ? 'clean' : 'dirty';
        doc.disk = {
          hash: res.hash,
          mtimeMs: res.mtimeMs,
          size: res.size,
        };
        delete doc.saveErrorMessage;
        if (doc.status === 'clean') backupApi.removeBackup(doc.id);
        return true;
      } else {
        if (res.status === 'conflict') {
          doc.status = 'conflict';
        } else {
          doc.status = 'saveFailed';
        }
        doc.saveErrorMessage = res.error || i18n.app.saveFailed;
        return false;
      }
    } finally {
      isSaving = false;
    }
  }

  async function saveAsDocument(id: string): Promise<boolean> {
    const doc = documents.value.find((d) => d.id === id);
    if (!doc) return false;

    const oldId = doc.id;
    const savedContent = doc.content;
    const saved = await fileApi.saveFileDialog(savedContent, doc.title, doc.encoding, doc.eol, doc.id);
    if (saved) {
      doc.path = saved.path;
      doc.title = saved.title;
      doc.encoding = saved.encoding;
      doc.eol = saved.eol;
      doc.status = doc.content === savedContent ? 'clean' : 'dirty';
      doc.disk = {
        hash: saved.hash,
        mtimeMs: saved.mtimeMs,
        size: saved.size,
      };
      delete doc.saveErrorMessage;
      if (doc.status === 'clean') {
        backupApi.removeBackup(oldId);
        backupApi.removeBackup(doc.id);
      }
      fileApi.addRecentFile({ path: saved.path, title: saved.title, accessedAt: Date.now() });
      return true;
    }
    return false;
  }

  async function reloadFromDisk(id: string) {
    const doc = documents.value.find((d) => d.id === id);
    if (!doc || !doc.path) return;

    const info = await fileApi.openFile(doc.path);
    if (info) {
      doc.content = info.content;
      doc.disk = { mtimeMs: info.mtimeMs, size: info.size, hash: info.hash };
      doc.status = 'clean';
      window.dispatchEvent(new CustomEvent('editor:remount-doc', { detail: { id: doc.id } }));
    }
  }

  async function keepMyVersion(id: string) {
    const doc = documents.value.find((d) => d.id === id);
    if (!doc) return;
    // Overwrite disk with force = true
    const ok = await saveDocument(id, true);
    if (ok) {
      doc.status = 'clean';
    } else {
      doc.status = 'dirty';
    }
  }

  async function handleExternalFileEvent(path: string) {
    const norm = path.replace(/\\/g, '/').toLowerCase();
    const doc = documents.value.find((d) => d.path && d.path.replace(/\\/g, '/').toLowerCase() === norm);
    if (!doc || !doc.path) return;

    const res = await fileApi.checkStatus(doc.id, doc.path, doc.disk?.hash || '', doc.disk?.mtimeMs || 0, doc.disk?.size || 0);
    if (!res) return;

    if (res.status === 'deleted') {
      doc.status = 'deleted';
    } else if (res.status === 'conflict') {
      if (doc.status === 'clean') {
        // Document clean: reload seamlessly
        await reloadFromDisk(doc.id);
      } else if (doc.status === 'dirty') {
        doc.status = 'conflict';
      }
    }
  }

  function handleExternalChange(path: string, newHash: string, newMtimeMs: number, newSize: number) {
    const doc = documents.value.find((d) => d.path && d.path.toLowerCase() === path.toLowerCase());
    if (!doc) return;

    if (newHash && doc.disk && doc.disk.hash === newHash) {
      // Touch-only, ignore
      doc.disk.mtimeMs = newMtimeMs;
      return;
    }

    if (doc.status === 'clean') {
      // Silent reload per Chapter 8.3
      reloadFromDisk(doc.id);
    } else if (doc.status === 'dirty') {
      doc.status = 'conflict';
    }
  }

  function handleExternalDelete(path: string) {
    const doc = documents.value.find((d) => d.path && d.path.toLowerCase() === path.toLowerCase());
    if (!doc) return;
    doc.status = 'deleted';
  }

  return {
    documents,
    activeDocumentId,
    activeDocument,
    outlineHeadings,
    stats,
    createNewDocument,
    checkDuplicate,
    openDocument,
    openFileFromPath,
    switchDocument,
    closeDocument,
    requestCloseDocument,
    updateContent,
    markEdited,
    saveDocument,
    saveAsDocument,
    reloadFromDisk,
    keepMyVersion,
    handleExternalFileEvent,
    handleExternalChange,
    handleExternalDelete,
  };
});
