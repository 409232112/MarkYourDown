import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { fileApi, backupApi, type FileInfo } from '../api';
import { i18n } from '../i18n/zh-CN';
import { useUiStore } from './ui';
import { useSettingsStore } from './settings';
import { FileService } from '../../bindings/markyourdown/internal/services';
import { convertHTMLAsync, type ConversionResult } from '../import/html';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';

type HtmlResult = Extract<ConversionResult, {status: 'complete' | 'degraded'}>;
export interface HtmlImportState {
  sourcePath: string;
  sourceState: 'unchanged' | 'changed' | 'deleted' | 'unknown';
  sourceDisk: { mtimeMs: number; size: number; hash: string };
  state: 'loading' | 'complete' | 'degraded' | 'unsupported' | 'failed';
  result?: ConversionResult;
  sourceHtml: string;
  generation: number;
  saving: boolean;
}
export function fileUrl(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('//')) {
    const parts = normalized.slice(2).split('/');
    const host = parts.shift() || '';
    return `file://${host}/${parts.map(encodeURIComponent).join('/')}`;
  }
  if (/^[a-z]:\//i.test(normalized)) return `file:///${normalized.split('/').map((p, i) => i === 0 ? p : encodeURIComponent(p)).join('/')}`;
  return `file://${normalized.split('/').map(encodeURIComponent).join('/')}`;
}
function rewriteReferences(markdown: string, rewrites: Array<{from: string; to: string}>): string {
  if (!rewrites.length) return markdown;
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, { bullet: '-', fences: true });
  const tree = processor.parse(markdown);
  const map = new Map(rewrites.map(r => [r.from, r.to]));
  visit(tree, (node) => {
    if ((node.type === 'image' || node.type === 'link' || node.type === 'definition') && 'url' in node && typeof node.url === 'string') {
      node.url = map.get(node.url) || node.url;
    }
  });
  return processor.stringify(tree);
}


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
  htmlImport?: HtmlImportState;
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
      const sourcePath = d.htmlImport?.sourcePath || d.path;
      if (!sourcePath) return false;
      const dNorm = sourcePath.replace(/\\/g, '/').toLowerCase();
      return dNorm === norm;
    });
    return existing ? existing.id : null;
  }

  // The converter remains pure; filesystem probes run outside the worker and only
  // definitive missing-file results become diagnostics. Unknown includes denied paths.
  async function inspectHtmlImages(result: HtmlResult, sourcePath: string, signal: AbortSignal): Promise<HtmlResult> {
    if (typeof fileApi.probeLocalImage !== 'function') return result;
    const targets = [...new Set(result.references.filter(r => r.kind === 'image' && /^file:/i.test(r.resolved)).map(r => r.resolved))];
    const outcomes = new Map<string, 'available' | 'missing' | 'unknown'>();
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
      while (!signal.aborted && index < targets.length) {
        const target = targets[index++];
        const outcome = await fileApi.probeLocalImage(sourcePath, target).catch(() => 'unknown' as const);
        if (!signal.aborted) outcomes.set(target, outcome);
      }
    }));
    if (signal.aborted) return result;
    const references = result.references.map(ref => outcomes.get(ref.resolved) === 'missing' && ref.kind === 'image' ? { ...ref, state: 'missing' as const } : ref);
    const missing = references.filter(ref => ref.kind === 'image' && ref.state === 'missing');
    if (!missing.length) return result;
    return { ...result, status: 'degraded', references,
      issues: [...result.issues, ...missing.map(() => ({ code: 'IMAGE_MISSING', severity: 'warning' as const, impact: 'resource' as const, message: '本地图片不存在，已保留原始引用', fallback: 'none' as const }))],
      summary: { ...result.summary, degradedBlockCount: result.summary.degradedBlockCount + missing.length },
    };
  }

  const importControllers = new Map<string, AbortController>();
  async function convertImport(doc: DocState, newHtml?: string, newDisk?: HtmlImportState['sourceDisk']) {
    if (!doc.htmlImport || doc.htmlImport.saving) return;
    importControllers.get(doc.id)?.abort();
    const controller = new AbortController();
    importControllers.set(doc.id, controller);
    const meta = doc.htmlImport;
    const previousResult = meta.result;
    const previousState = meta.state;
    meta.state = 'loading';
    try {
      let result = await convertHTMLAsync({ requestId: `${doc.id}-${meta.generation + 1}`, html: newHtml ?? meta.sourceHtml, sourceFileUrl: fileUrl(meta.sourcePath), converterVersion: 'html-v1' }, controller.signal);
      if (controller.signal.aborted || !documents.value.includes(doc) || doc.htmlImport !== meta) return;
      if (result.status === 'complete' || result.status === 'degraded') result = await inspectHtmlImages(result, meta.sourcePath, controller.signal);
      if (controller.signal.aborted || !documents.value.includes(doc) || doc.htmlImport !== meta) return;
      if (newHtml !== undefined && previousResult && (previousState === 'complete' || previousState === 'degraded') && (result.status === 'failed' || result.status === 'unsupported')) {
        meta.state = previousState;
        useUiStore().flashStatus('重新转换失败，已保留原预览');
        return;
      }
      meta.result = result;
      meta.state = result.status;
      if (newHtml !== undefined && (result.status === 'complete' || result.status === 'degraded')) { meta.sourceHtml = newHtml; meta.sourceState = 'unchanged'; if (newDisk) meta.sourceDisk = newDisk; }
      meta.generation++;
      if (result.status === 'complete' || result.status === 'degraded') doc.content = result.markdown;
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('editor:remount-doc', { detail: { id: doc.id } }));
    } catch (error) {
      if (controller.signal.aborted || !documents.value.includes(doc)) return;
      if (previousResult && (previousState === 'complete' || previousState === 'degraded')) {
        meta.state = previousState;
        useUiStore().flashStatus('重新转换失败，已保留原预览');
        return;
      }
      meta.state = 'failed';
      meta.result = { status: 'failed', requestId: doc.id, error: { code: 'CONVERSION_FAILED', message: String(error), retryable: true } };
    } finally {
      if (importControllers.get(doc.id) === controller) importControllers.delete(doc.id);
    }
  }

  function cancelImport(doc: DocState) {
    importControllers.get(doc.id)?.abort();
    importControllers.delete(doc.id);
    const meta = doc.htmlImport;
    if (meta?.result?.status === 'complete' || meta?.result?.status === 'degraded') {
      meta.state = meta.result.status;
    } else closeDocument(doc.id);
  }

  async function reloadHtmlImport(doc: DocState) {
    const meta = doc.htmlImport;
    if (!meta || meta.saving || !meta.sourcePath) return;
    const info = await fileApi.openFile(meta.sourcePath);
    if (!info || !documents.value.includes(doc) || doc.htmlImport !== meta) {
      useUiStore().flashStatus('读取源文件失败，已保留原预览');
      return;
    }
    await convertImport(doc, info.content, { mtimeMs: info.mtimeMs, size: info.size, hash: info.hash });
  }

  function openDocument(info: FileInfo) {
    // Check if already open
    const existingId = checkDuplicate(info.path);
    if (existingId) {
      activeDocumentId.value = existingId;
      return existingId;
    }

    if (info.format === 'html' || /\.html?$/i.test(info.path || info.title)) {
      const doc: DocState = {
        id: info.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        path: null, title: info.title, mode: 'live', eol: 'lf', encoding: info.encoding,
        status: 'clean', content: '',
        htmlImport: { sourcePath: info.path, sourceState: 'unchanged', sourceDisk: { mtimeMs: info.mtimeMs, size: info.size, hash: info.hash }, state: 'loading', sourceHtml: info.content, generation: 0, saving: false },
      };
      documents.value.unshift(doc);
      activeDocumentId.value = doc.id;
      if (info.path) fileApi.addRecentFile({ path: info.path, title: info.title, accessedAt: Date.now() });
      void convertImport(documents.value[0]);
      return doc.id;
    }

    // Reuse empty untitled clean document if single and untouched
    if (
      documents.value.length === 1 &&
      documents.value[0].path === null &&
      !documents.value[0].htmlImport &&
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

  function restoreDraft(info: FileInfo) {
    const existingId = checkDuplicate(info.path);
    const existing = documents.value.find((doc) => doc.id === existingId);
    const preserveExisting = existing && existing.status !== 'clean';
    if (existing && !preserveExisting) closeDocument(existing.id);
    const id = openDocument(preserveExisting ? { ...info, path: '' } : info);
    const restored = documents.value.find((doc) => doc.id === id);
    if (restored) restored.status = 'dirty';
    return id;
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
    importControllers.get(id)?.abort();
    importControllers.delete(id);
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
    if (doc.htmlImport?.saving) {
      useUiStore().flashStatus('正在保存，请等待完成后关闭');
      return;
    }

    if (doc.status !== 'clean') {
      const uiStore = useUiStore();
      uiStore.showConfirm({
        title: i18n.dialog.unsavedTitle,
        message: i18n.dialog.unsavedMessage.replace('{title}', doc.title),
        confirmText: i18n.dialog.save,
        secondaryText: i18n.dialog.dontSave,
        cancelText: i18n.dialog.cancel,
        onConfirm: async () => {
          const ok = await saveDocument(id);
          if (ok && doc.status === 'clean') {
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

  function requestCloseDocuments(ids: string[]) {
    const remaining = [...ids];
    const closeNext = () => {
      const id = remaining.shift();
      if (!id) return;
      if (!documents.value.some((doc) => doc.id === id)) {
        closeNext();
        return;
      }
      requestCloseDocument(id, () => queueMicrotask(closeNext));
    };
    closeNext();
  }

  function updateContent(id: string, content: string) {
    const doc = documents.value.find((d) => d.id === id);
    if (!doc || doc.htmlImport) return;
    if (doc.content === content) return;
    doc.content = content;
    if (doc.status === 'clean') {
      doc.status = 'dirty';
    }
    scheduleDraftBackup(doc);
  }

  const savingDocuments = new Set<string>();
  async function saveDocument(id: string, force = false): Promise<boolean> {
    if (savingDocuments.has(id)) return false;
    savingDocuments.add(id);
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
      savingDocuments.delete(id);
    }
  }

  async function saveAsDocument(id: string): Promise<boolean> {
    const doc = documents.value.find((d) => d.id === id);
    if (!doc) return false;
    if (doc.htmlImport) return saveHtmlImport(doc);

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

  async function saveHtmlImport(doc: DocState): Promise<boolean> {
    const meta = doc.htmlImport;
    if (!meta || meta.saving || (meta.state !== 'complete' && meta.state !== 'degraded')) return false;
    const result = meta.result as HtmlResult;
    const service = FileService as any;
    if (!service.BeginHtmlSave || !service.CommitHtmlSave || !service.AbortHtmlSave) {
      useUiStore().flashStatus('另存为服务不可用');
      return false;
    }
    meta.saving = true;
    let ticket = '';
    try {
      const begin = await service.BeginHtmlSave({ documentId: doc.id, sourcePath: meta.sourcePath, suggestedName: doc.title.replace(/\.html?$/i, '') + '.md', references: result.references });
      if (!begin || begin.status === 'cancelled') return false;
      if (begin.status !== 'ready') throw new Error(begin.message || '准备另存为失败');
      ticket = begin.ticket;
      const duplicate = checkDuplicate(begin.targetPath);
      if (duplicate && duplicate !== doc.id) throw new Error('目标文件已在其他标签打开，请先关闭该标签');
      const markdown = rewriteReferences(doc.content, begin.rewrites || []);
      const eol = useSettingsStore().settings.defaultEol;
      const saved = await service.CommitHtmlSave({ ticket, markdown, eol });
      if (!saved || saved.status !== 'saved') throw new Error(saved?.message || '保存失败');
      ticket = '';
      if (!documents.value.includes(doc) || doc.htmlImport !== meta) return true;
      doc.path = saved.path;
      doc.title = saved.path.split(/[/\\]/).pop() || doc.title;
      doc.content = markdown;
      doc.eol = eol;
      doc.encoding = 'utf8';
      doc.disk = saved.disk;
      doc.status = 'clean';
      delete doc.htmlImport;
      fileApi.addRecentFile({ path: saved.path, title: doc.title, accessedAt: Date.now() });
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('editor:remount-doc', { detail: { id: doc.id } }));
      if (begin.warnings?.length) useUiStore().flashStatus(begin.warnings.join('；'));
      return true;
    } catch (error) {
      useUiStore().flashStatus(`另存为失败：${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      if (ticket) await service.AbortHtmlSave({ ticket }).catch(() => {});
      meta.saving = false;
    }
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
    const imported = documents.value.find(d => d.htmlImport?.sourcePath.replace(/\\/g, '/').toLowerCase() === norm);
    if (imported?.htmlImport) {
      const meta = imported.htmlImport;
      const disk = meta.sourceDisk;
      const generation = meta.generation;
      const status = await fileApi.checkStatus(imported.id, meta.sourcePath, disk.hash, disk.mtimeMs, disk.size);
      if (!documents.value.includes(imported) || imported.htmlImport !== meta || meta.generation !== generation) return;
      meta.sourceState = status?.status === 'deleted' ? 'deleted' : status?.status === 'conflict' ? 'changed' : status?.status === 'clean' ? 'unchanged' : 'unknown';
      if (status?.status === 'clean' && status.disk) meta.sourceDisk = status.disk;
      return;
    }
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
    convertImport,
    cancelImport,
    reloadHtmlImport,
    restoreDraft,
    openFileFromPath,
    switchDocument,
    closeDocument,
    requestCloseDocument,
    requestCloseDocuments,
    updateContent,
    saveDocument,
    saveAsDocument,
    reloadFromDisk,
    keepMyVersion,
    handleExternalFileEvent,
    handleExternalChange,
    handleExternalDelete,
  };
});
