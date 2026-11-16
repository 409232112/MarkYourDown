<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useDocumentsStore } from '../stores/documents';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';
import { createLiveEditor, type LiveEditorInstance } from '../editor/live';
import { createSourceEditor, type SourceEditorInstance } from '../editor/source';
import { pmToCmCursor, cmToPmCursor } from '../editor/sync';
import { setBlockType, toggleMark, wrapIn } from '@milkdown/kit/prose/commands';
import { wrapInList } from '@milkdown/kit/prose/schema-list';
import {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
} from '@milkdown/kit/prose/tables';
import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import { EditorSelection } from '@codemirror/state';
import { setSearchQuery, SearchQuery } from '@codemirror/search';
import { searchPluginKey } from '../editor/live';
import { i18n } from '../i18n/zh-CN';
import EditorContextMenu from './EditorContextMenu.vue';
import { FileService } from '../../bindings/markyourdown/internal/services';

const docsStore = useDocumentsStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const containerRef = ref<HTMLElement | null>(null);

let liveEditorInstance: LiveEditorInstance | null = null;
let sourceEditorInstance: SourceEditorInstance | null = null;
let autoSaveTimer: any = null;

// Track active doc id & mode to prevent unnecessary remounts
let currentMountedDocId: string | null = null;
let currentMountedMode: 'live' | 'source' | null = null;

// Context Menu state
const contextMenuVisible = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });

function handleContextMenu(e: MouseEvent) {
  contextMenuPos.value = { x: e.clientX, y: e.clientY };
  contextMenuVisible.value = true;
}

function handleContextMenuAction(data: { action: string; payload?: any }) {
  executeEditorAction(data.action, data.payload);
}

function handleContainerClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (
    target.closest('button') ||
    target.closest('input') ||
    target.closest('select') ||
    target.closest('textarea') ||
    target.closest('a') ||
    target.closest('.context-menu') ||
    target.closest('.table-toolbar') ||
    target.closest('.image-modal')
  ) {
    return;
  }

  const isLive = docsStore.activeDocument?.mode === 'live';
  if (isLive) {
    const view = liveEditorInstance?.getView();
    if (!view) return;
    view.focus();

    const posInfo = view.posAtCoords({ left: e.clientX, top: e.clientY });
    if (posInfo && typeof posInfo.pos === 'number') {
      try {
        const sel = Selection.near(view.state.doc.resolve(posInfo.pos));
        view.dispatch(view.state.tr.setSelection(sel));
      } catch {
        const sel = Selection.atStart(view.state.doc);
        view.dispatch(view.state.tr.setSelection(sel));
      }
    } else {
      try {
        const sel = Selection.atEnd(view.state.doc);
        view.dispatch(view.state.tr.setSelection(sel));
      } catch {
        // fallback
      }
    }
  } else {
    const cm = sourceEditorInstance?.view;
    if (!cm) return;
    cm.focus();
    const pos = cm.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos !== null) {
      cm.dispatch({ selection: { anchor: pos } });
    } else {
      cm.dispatch({ selection: { anchor: cm.state.doc.length } });
    }
  }
}

// Find & Replace state
interface MatchPos {
  from: number;
  to: number;
}
let currentMatches: MatchPos[] = [];
let currentMatchIndex = -1;
let lastSearchQuery = '';

async function destroyCurrentEditor() {
  if (liveEditorInstance) {
    try {
      await liveEditorInstance.destroy();
    } catch (e) {
      console.warn('Destroy live editor error:', e);
    }
    liveEditorInstance = null;
  }
  if (sourceEditorInstance) {
    try {
      sourceEditorInstance.destroy();
    } catch (e) {
      console.warn('Destroy source editor error:', e);
    }
    sourceEditorInstance = null;
  }
  if (containerRef.value) {
    containerRef.value.innerHTML = '';
  }
  currentMountedDocId = null;
  currentMountedMode = null;
  currentMatches = [];
  currentMatchIndex = -1;
  lastSearchQuery = '';
}

function triggerAutoSave() {
  if (!settingsStore.settings.autoSave) return;
  const doc = docsStore.activeDocument;
  if (!doc || !doc.path || doc.status === 'conflict' || doc.status === 'deleted') return;

  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(async () => {
    if (doc.status === 'dirty') {
      const ok = await docsStore.saveDocument(doc.id);
      if (ok) {
        uiStore.flashStatus(i18n.app.saved);
      }
    }
  }, (settingsStore.settings.autoSaveInterval || 3) * 1000);
}

async function mountEditor() {
  const doc = docsStore.activeDocument;
  if (!doc || !containerRef.value) {
    await destroyCurrentEditor();
    return;
  }

  // If already mounted for this doc and mode, skip
  if (currentMountedDocId === doc.id && currentMountedMode === doc.mode) {
    return;
  }

  await destroyCurrentEditor();
  currentMountedDocId = doc.id;
  currentMountedMode = doc.mode;

  if (doc.mode === 'live') {
    try {
      liveEditorInstance = await createLiveEditor(containerRef.value, {
        initialText: doc.content,
        docPath: doc.path,
        getDocPath: () => docsStore.activeDocument?.path || doc.path,
        onDocChange: () => {
          if (doc.id === docsStore.activeDocumentId) docsStore.markEdited(doc.id);
        },
        onChange: (markdown: string) => {
          if (doc.id === docsStore.activeDocumentId) {
            docsStore.updateContent(doc.id, markdown);
            triggerAutoSave();
          }
        },
        onToggleMode: () => {
          handleToggleMode();
        },
        onSave: () => {
          docsStore.saveDocument(doc.id);
        },
      });
      await nextTick();
      liveEditorInstance.focus();
    } catch (e) {
      console.error('Failed to mount Live Editor:', e);
      // Fallback to source mode if live mount fails
      doc.mode = 'source';
    }
  } else {
    sourceEditorInstance = createSourceEditor(containerRef.value, {
      initialText: doc.content,
      showLineNumbers: settingsStore.settings.codeLineNumbers,
      wordWrap: settingsStore.settings.softWrap,
      onChange: (text: string) => {
        if (doc.id === docsStore.activeDocumentId) {
          docsStore.updateContent(doc.id, text);
          triggerAutoSave();
        }
      },
      onToggleMode: () => {
        handleToggleMode();
      },
      onSave: () => {
        docsStore.saveDocument(doc.id);
      },
    });
    sourceEditorInstance.focus();
  }
}

function handleToggleMode() {
  const doc = docsStore.activeDocument;
  if (!doc) return;

  if (doc.mode === 'live') {
    let offset = 0;
    if (liveEditorInstance) {
      const pmDoc = liveEditorInstance.getPmDoc();
      const pos = liveEditorInstance.getPmPos();
      if (pmDoc) {
        offset = pmToCmCursor(pmDoc, pos);
      }
      doc.content = liveEditorInstance.getMarkdown();
    }
    doc.mode = 'source';
    nextTick(() => {
      if (sourceEditorInstance) {
        sourceEditorInstance.setCursor(offset);
      }
    });
  } else {
    let pmPos = 1;
    if (sourceEditorInstance) {
      const offset = sourceEditorInstance.getCursor();
      pmPos = cmToPmCursor(doc.content, offset);
      doc.content = sourceEditorInstance.getValue();
    }
    doc.mode = 'live';
    nextTick(() => {
      if (liveEditorInstance) {
        liveEditorInstance.setPmPos(pmPos);
      }
    });
  }
}

// Watch active doc or mode changes
watch(
  () => [docsStore.activeDocumentId, docsStore.activeDocument?.mode],
  () => {
    mountEditor();
  }
);

watch(
  () => uiStore.findBarVisible,
  (visible) => {
    if (!visible) {
      performFind('', false, 'stay');
    }
  }
);

// Heading navigation listener
function handleNavigateHeading(e: Event) {
  const custom = e as CustomEvent<{ line: number; text: string; level: number }>;
  if (sourceEditorInstance && docsStore.activeDocument?.mode === 'source') {
    const lines = docsStore.activeDocument.content.split(/\r?\n/);
    let offset = 0;
    for (let i = 0; i < custom.detail.line - 1 && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    sourceEditorInstance.setCursor(offset);
  }
}

function handleEditorWheel(e: WheelEvent) {
  if (e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
    const currentSize = settingsStore.settings.fontSize || 17;
    const delta = e.deltaY < 0 ? 1 : -1;
    const nextSize = Math.max(12, Math.min(36, currentSize + delta));
    if (nextSize !== currentSize) {
      settingsStore.setFontSize(nextSize);
      uiStore.flashStatus(`字号: ${nextSize}px`);
    }
  }
}

async function insertLocalImage() {
  const doc = docsStore.activeDocument;
  if (!doc?.path) {
    window.alert('请先保存文档，再插入本地图片。');
    return;
  }
  const docPath = doc.path;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      if (docsStore.activeDocument?.id !== doc.id) return;
      const result = await FileService.SaveImage({ docPath, imageData: dataUrl.split(',')[1] });
      if (!result || docsStore.activeDocument?.id !== doc.id) return;
      const src = result.relativePath;
      if (doc.mode === 'live') {
        const view = liveEditorInstance?.getView();
        const image = view?.state.schema.nodes.image;
        if (view && image) {
          view.dispatch(view.state.tr.replaceSelectionWith(image.create({ src, alt: file.name })).scrollIntoView());
          view.focus();
        }
      } else {
        const cm = sourceEditorInstance?.view;
        if (cm) {
          const { from, to } = cm.state.selection.main;
          cm.dispatch({ changes: { from, to, insert: `![${file.name.replace(/[\[\]]/g, '')}](${src})` } });
          cm.focus();
        }
      }
    } catch (error) {
      window.alert(`插入图片失败：${String(error)}`);
    }
  };
  input.click();
}

// Editor formatting & context actions
function executeEditorAction(action: string, payload?: any) {
  if (action === 'image') {
    void insertLocalImage();
    return;
  }
  const isLive = docsStore.activeDocument?.mode === 'live';

  if (isLive) {
    const view = liveEditorInstance?.getView();
    if (!view) return;
    view.focus();
    const { state, dispatch } = view;
    const { schema, selection } = state;

    if (action === 'heading') {
      const level = payload || 1;
      if (schema.nodes.heading) {
        setBlockType(schema.nodes.heading, { level })(state, dispatch);
      }
    } else if (action === 'paragraph') {
      if (schema.nodes.paragraph) {
        setBlockType(schema.nodes.paragraph)(state, dispatch);
      }
    } else if (action === 'upgrade-heading') {
      const { $from } = selection;
      let cur = 1;
      for (let d = $from.depth; d > 0; d--) {
        const n = $from.node(d);
        if (n.type.name === 'heading') {
          cur = n.attrs.level || 1;
          break;
        }
      }
      setBlockType(schema.nodes.heading, { level: Math.max(1, cur - 1) })(state, dispatch);
    } else if (action === 'downgrade-heading') {
      const { $from } = selection;
      let cur = 1;
      for (let d = $from.depth; d > 0; d--) {
        const n = $from.node(d);
        if (n.type.name === 'heading') {
          cur = n.attrs.level || 1;
          break;
        }
      }
      setBlockType(schema.nodes.heading, { level: Math.min(6, cur + 1) })(state, dispatch);
    } else if (action === 'bold') {
      if (schema.marks.strong) {
        toggleMark(schema.marks.strong)(state, dispatch);
      }
    } else if (action === 'italic') {
      if (schema.marks.em) {
        toggleMark(schema.marks.em)(state, dispatch);
      }
    } else if (action === 'underline') {
      if (schema.marks.underline) {
        toggleMark(schema.marks.underline)(state, dispatch);
      } else {
        const text = state.doc.textBetween(selection.from, selection.to) || '下划线文字';
        dispatch(state.tr.replaceSelectionWith(schema.text(`<u>${text}</u>`)));
      }
    } else if (action === 'inlineCode') {
      if (schema.marks.code_inline) {
        toggleMark(schema.marks.code_inline)(state, dispatch);
      }
    } else if (action === 'link') {
      const text = state.doc.textBetween(selection.from, selection.to) || '链接文本';
      dispatch(state.tr.replaceSelectionWith(schema.text(`[${text}](https://)`)));
    } else if (action === 'hr') {
      const hrNode = schema.nodes.hr || schema.nodes.horizontal_rule;
      if (hrNode) {
        dispatch(state.tr.replaceSelectionWith(hrNode.create()).scrollIntoView());
      } else {
        dispatch(state.tr.replaceSelectionWith(schema.text('\n---\n')));
      }
    } else if (action === 'code') {
      const fenceNode = schema.nodes.fence || schema.nodes.code_block;
      if (fenceNode) {
        setBlockType(fenceNode)(state, dispatch);
      } else {
        const text = state.doc.textBetween(selection.from, selection.to);
        dispatch(state.tr.replaceSelectionWith(schema.text(`\`\`\`\n${text}\n\`\`\``)));
      }
    } else if (action === 'math') {
      const text = state.doc.textBetween(selection.from, selection.to);
      dispatch(state.tr.replaceSelectionWith(schema.text(`$$\n${text}\n$$`)));
    } else if (action === 'table') {
      const tableText = '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n';
      dispatch(state.tr.replaceSelectionWith(schema.text(tableText)));
    } else if (action === 'blockquote') {
      if (schema.nodes.blockquote) {
        wrapIn(schema.nodes.blockquote)(state, dispatch);
      }
    } else if (action === 'bullet-list') {
      if (schema.nodes.bullet_list) {
        wrapInList(schema.nodes.bullet_list)(state, dispatch);
      }
    } else if (action === 'ordered-list') {
      if (schema.nodes.ordered_list) {
        wrapInList(schema.nodes.ordered_list)(state, dispatch);
      }
    } else if (action === 'task-list') {
      dispatch(state.tr.replaceSelectionWith(schema.text('- [ ] ')));
    } else if (action === 'insert-paragraph-before') {
      const pos = selection.$from.before(1);
      if (schema.nodes.paragraph) {
        dispatch(state.tr.insert(pos, schema.nodes.paragraph.create()));
      }
    } else if (action === 'insert-paragraph-after') {
      const pos = selection.$to.after(1);
      if (schema.nodes.paragraph) {
        dispatch(state.tr.insert(pos, schema.nodes.paragraph.create()));
      }
    } else if (action === 'cut') {
      document.execCommand('cut');
    } else if (action === 'copy') {
      document.execCommand('copy');
    } else if (action === 'paste') {
      navigator.clipboard.readText().then((text) => {
        if (!text) return;
        const v = liveEditorInstance?.getView();
        if (v) v.dispatch(v.state.tr.insertText(text).scrollIntoView());
      });
    } else if (action === 'delete') {
      dispatch(state.tr.deleteSelection().scrollIntoView());
    } else if (action === 'copy-plain-text') {
      const text = state.doc.textBetween(selection.from, selection.to) || docsStore.activeDocument?.content || '';
      navigator.clipboard.writeText(text);
      uiStore.flashStatus('已复制纯文本');
    } else if (action === 'copy-markdown') {
      const md = docsStore.activeDocument?.content || '';
      navigator.clipboard.writeText(md);
      uiStore.flashStatus('已复制 Markdown');
    } else if (action === 'copy-html') {
      const html = view.dom.innerHTML || '';
      navigator.clipboard.writeText(html);
      uiStore.flashStatus('已复制 HTML');
    } else if (action === 'table-add-row-before') {
      addRowBefore(state, dispatch);
    } else if (action === 'table-add-row-after') {
      addRowAfter(state, dispatch);
    } else if (action === 'table-add-col-before') {
      addColumnBefore(state, dispatch);
    } else if (action === 'table-add-col-after') {
      addColumnAfter(state, dispatch);
    } else if (action === 'table-delete-row') {
      deleteRow(state, dispatch);
    } else if (action === 'table-delete-col') {
      deleteColumn(state, dispatch);
    } else if (action === 'table-delete') {
      deleteTable(state, dispatch);
    }
  } else {
    const cm = sourceEditorInstance?.view;
    if (!cm) return;
    cm.focus();
    const { from, to } = cm.state.selection.main;
    const selectedText = cm.state.sliceDoc(from, to);

    if (action === 'heading') {
      const level = payload || 1;
      const hashes = '#'.repeat(level) + ' ';
      const line = cm.state.doc.lineAt(from);
      const lineText = line.text.replace(/^#+\s*/, '');
      cm.dispatch({
        changes: { from: line.from, to: line.to, insert: `${hashes}${lineText}` },
        selection: { anchor: line.from + hashes.length + (from - line.from) },
      });
    } else if (action === 'paragraph') {
      const line = cm.state.doc.lineAt(from);
      const lineText = line.text.replace(/^#+\s*/, '');
      cm.dispatch({
        changes: { from: line.from, to: line.to, insert: lineText },
        selection: { anchor: line.from },
      });
    } else if (action === 'upgrade-heading') {
      const line = cm.state.doc.lineAt(from);
      const m = line.text.match(/^(#{1,6})\s/);
      if (m) {
        const cur = m[1].length;
        const next = Math.max(1, cur - 1);
        const hashes = '#'.repeat(next) + ' ';
        const text = line.text.replace(/^#+\s*/, '');
        cm.dispatch({ changes: { from: line.from, to: line.to, insert: `${hashes}${text}` } });
      }
    } else if (action === 'downgrade-heading') {
      const line = cm.state.doc.lineAt(from);
      const m = line.text.match(/^(#{1,6})\s/);
      if (m) {
        const cur = m[1].length;
        const next = Math.min(6, cur + 1);
        const hashes = '#'.repeat(next) + ' ';
        const text = line.text.replace(/^#+\s*/, '');
        cm.dispatch({ changes: { from: line.from, to: line.to, insert: `${hashes}${text}` } });
      }
    } else if (action === 'bold') {
      const ins = selectedText ? `**${selectedText}**` : `****`;
      cm.dispatch({
        changes: { from, to, insert: ins },
        selection: { anchor: selectedText ? to + 4 : from + 2 },
      });
    } else if (action === 'italic') {
      const ins = selectedText ? `*${selectedText}*` : `**`;
      cm.dispatch({
        changes: { from, to, insert: ins },
        selection: { anchor: selectedText ? to + 2 : from + 1 },
      });
    } else if (action === 'underline') {
      const ins = `<u>${selectedText || '下划线文字'}</u>`;
      cm.dispatch({
        changes: { from, to, insert: ins },
        selection: { anchor: from + ins.length },
      });
    } else if (action === 'inlineCode') {
      const ins = selectedText ? `\`${selectedText}\`` : `\`\``;
      cm.dispatch({
        changes: { from, to, insert: ins },
        selection: { anchor: selectedText ? to + 2 : from + 1 },
      });
    } else if (action === 'link') {
      const text = selectedText || '链接文本';
      const ins = `[${text}](https://)`;
      cm.dispatch({
        changes: { from, to, insert: ins },
        selection: { anchor: from + ins.length - 1 },
      });
    } else if (action === 'hr') {
      cm.dispatch({ changes: { from, to, insert: '\n---\n' } });
    } else if (action === 'code') {
      const ins = `\`\`\`\n${selectedText}\n\`\`\`\n`;
      cm.dispatch({
        changes: { from, to, insert: ins },
        selection: { anchor: from + 4 },
      });
    } else if (action === 'math') {
      const ins = `$$\n${selectedText}\n$$\n`;
      cm.dispatch({
        changes: { from, to, insert: ins },
        selection: { anchor: from + 3 },
      });
    } else if (action === 'table') {
      const ins = '\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n';
      cm.dispatch({
        changes: { from, to, insert: ins },
        selection: { anchor: from + ins.length },
      });
    } else if (action === 'blockquote') {
      const line = cm.state.doc.lineAt(from);
      cm.dispatch({ changes: { from: line.from, to: line.from, insert: '> ' } });
    } else if (action === 'bullet-list') {
      const line = cm.state.doc.lineAt(from);
      cm.dispatch({ changes: { from: line.from, to: line.from, insert: '- ' } });
    } else if (action === 'ordered-list') {
      const line = cm.state.doc.lineAt(from);
      cm.dispatch({ changes: { from: line.from, to: line.from, insert: '1. ' } });
    } else if (action === 'task-list') {
      const line = cm.state.doc.lineAt(from);
      cm.dispatch({ changes: { from: line.from, to: line.from, insert: '- [ ] ' } });
    } else if (action === 'insert-paragraph-before') {
      const line = cm.state.doc.lineAt(from);
      cm.dispatch({ changes: { from: line.from, to: line.from, insert: '\n' } });
    } else if (action === 'insert-paragraph-after') {
      const line = cm.state.doc.lineAt(from);
      cm.dispatch({ changes: { from: line.to, to: line.to, insert: '\n' } });
    } else if (action === 'cut') {
      document.execCommand('cut');
    } else if (action === 'copy') {
      document.execCommand('copy');
    } else if (action === 'paste') {
      navigator.clipboard.readText().then((text) => {
        if (!text) return;
        const c = sourceEditorInstance?.view;
        if (c) c.dispatch({ changes: { from: c.state.selection.main.from, insert: text } });
      });
    } else if (action === 'delete') {
      cm.dispatch({ changes: { from, to, insert: '' } });
    } else if (action === 'copy-plain-text') {
      const text = selectedText || cm.state.doc.toString();
      navigator.clipboard.writeText(text);
      uiStore.flashStatus('已复制纯文本');
    } else if (action === 'copy-markdown') {
      const md = docsStore.activeDocument?.content || '';
      navigator.clipboard.writeText(md);
      uiStore.flashStatus('已复制 Markdown');
    } else if (action === 'copy-html') {
      navigator.clipboard.writeText(docsStore.activeDocument?.content || '');
      uiStore.flashStatus('已复制 HTML');
    }
  }
}

function handleEditorAction(e: Event) {
  const custom = e as CustomEvent<{ action: string; payload?: any }>;
  const { action, payload } = custom.detail || {};
  executeEditorAction(action, payload);
}

// Find & Replace implementations
function performFind(query: string, matchCase: boolean, direction: 'next' | 'prev' | 'stay' | 'query') {
  const isLive = docsStore.activeDocument?.mode === 'live';

  if (!query) {
    currentMatches = [];
    currentMatchIndex = -1;
    lastSearchQuery = '';
    if (isLive) {
      const view = liveEditorInstance?.getView();
      if (view) {
        view.dispatch(
          view.state.tr.setMeta(searchPluginKey, {
            query: '',
            matchCase: false,
            matches: [],
            activeIndex: -1,
          })
        );
      }
    } else {
      const cm = sourceEditorInstance?.view;
      if (cm) {
        cm.dispatch({
          effects: setSearchQuery.of(new SearchQuery({ search: '' })),
        });
      }
    }
    window.dispatchEvent(
      new CustomEvent('editor:match-status', {
        detail: { current: 0, total: 0 },
      })
    );
    return;
  }

  const queryChanged = query !== lastSearchQuery;
  lastSearchQuery = query;

  if (isLive) {
    const view = liveEditorInstance?.getView();
    if (!view) return;

    if (queryChanged || currentMatches.length === 0) {
      currentMatches = [];
      const flags = matchCase ? 'g' : 'gi';
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, flags);

      view.state.doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          let m: RegExpExecArray | null;
          while ((m = regex.exec(node.text)) !== null) {
            currentMatches.push({
              from: pos + m.index,
              to: pos + m.index + m[0].length,
            });
          }
        }
      });
      currentMatchIndex = currentMatches.length > 0 ? 0 : -1;
    } else if (direction === 'next') {
      currentMatchIndex = (currentMatchIndex + 1) % currentMatches.length;
    } else if (direction === 'prev') {
      currentMatchIndex = (currentMatchIndex - 1 + currentMatches.length) % currentMatches.length;
    }

    if (currentMatchIndex >= 0 && currentMatchIndex < currentMatches.length) {
      const match = currentMatches[currentMatchIndex];
      const sel = TextSelection.create(view.state.doc, match.from, match.to);
      view.dispatch(
        view.state.tr
          .setMeta(searchPluginKey, {
            query,
            matchCase,
            matches: currentMatches,
            activeIndex: currentMatchIndex,
          })
          .setSelection(sel)
          .scrollIntoView()
      );

      // Force container smooth scroll jump to active match
      setTimeout(() => {
        const activeEl = containerRef.value?.querySelector('.myd-search-match-active') as HTMLElement | null;
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          try {
            const coords = view.coordsAtPos(match.from);
            const container = containerRef.value?.parentElement;
            if (container && coords) {
              const containerRect = container.getBoundingClientRect();
              const targetTop = container.scrollTop + (coords.top - containerRect.top) - containerRect.height / 2;
              container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
            }
          } catch {}
        }
      }, 20);
    } else {
      view.dispatch(
        view.state.tr.setMeta(searchPluginKey, {
          query,
          matchCase,
          matches: [],
          activeIndex: -1,
        })
      );
    }

    window.dispatchEvent(
      new CustomEvent('editor:match-status', {
        detail: {
          current: currentMatchIndex >= 0 ? currentMatchIndex : 0,
          total: currentMatches.length,
        },
      })
    );
  } else {
    const cm = sourceEditorInstance?.view;
    if (!cm) return;

    if (queryChanged || currentMatches.length === 0) {
      currentMatches = [];
      const text = cm.state.doc.toString();
      const flags = matchCase ? 'g' : 'gi';
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, flags);
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        currentMatches.push({
          from: m.index,
          to: m.index + m[0].length,
        });
      }
      currentMatchIndex = currentMatches.length > 0 ? 0 : -1;
      cm.dispatch({
        effects: setSearchQuery.of(new SearchQuery({ search: query, caseSensitive: matchCase })),
      });
    } else if (direction === 'next') {
      currentMatchIndex = (currentMatchIndex + 1) % currentMatches.length;
    } else if (direction === 'prev') {
      currentMatchIndex = (currentMatchIndex - 1 + currentMatches.length) % currentMatches.length;
    }

    if (currentMatchIndex >= 0 && currentMatchIndex < currentMatches.length) {
      const match = currentMatches[currentMatchIndex];
      cm.dispatch({
        selection: EditorSelection.single(match.from, match.to),
        scrollIntoView: true,
      });

      setTimeout(() => {
        const domSel = cm.dom.querySelector('.cm-searchMatch-selected, .cm-searchMatch') as HTMLElement | null;
        if (domSel) {
          domSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          try {
            const coords = cm.coordsAtPos(match.from);
            const container = containerRef.value?.parentElement;
            if (container && coords) {
              const containerRect = container.getBoundingClientRect();
              const targetTop = container.scrollTop + (coords.top - containerRect.top) - containerRect.height / 2;
              container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
            }
          } catch {}
        }
      }, 20);
    }

    window.dispatchEvent(
      new CustomEvent('editor:match-status', {
        detail: {
          current: currentMatchIndex >= 0 ? currentMatchIndex : 0,
          total: currentMatches.length,
        },
      })
    );
  }
}

function handleFindQuery(e: Event) {
  const custom = e as CustomEvent<{ query: string; matchCase: boolean }>;
  performFind(custom.detail.query, custom.detail.matchCase, 'query');
}

function handleFindNext(e: Event) {
  const custom = e as CustomEvent<{ query: string; matchCase: boolean }>;
  performFind(custom.detail.query, custom.detail.matchCase, 'next');
}

function handleFindPrev(e: Event) {
  const custom = e as CustomEvent<{ query: string; matchCase: boolean }>;
  performFind(custom.detail.query, custom.detail.matchCase, 'prev');
}

function handleReplace(e: Event) {
  const custom = e as CustomEvent<{ query: string; replacement: string; matchCase: boolean }>;
  const { query, replacement, matchCase } = custom.detail;
  const isLive = docsStore.activeDocument?.mode === 'live';

  if (isLive) {
    const view = liveEditorInstance?.getView();
    if (!view) return;
    if (currentMatchIndex >= 0 && currentMatchIndex < currentMatches.length) {
      const match = currentMatches[currentMatchIndex];
      view.dispatch(view.state.tr.insertText(replacement, match.from, match.to).scrollIntoView());
    }
    lastSearchQuery = '';
    performFind(query, matchCase, 'stay');
  } else {
    const cm = sourceEditorInstance?.view;
    if (!cm) return;
    if (currentMatchIndex >= 0 && currentMatchIndex < currentMatches.length) {
      const match = currentMatches[currentMatchIndex];
      cm.dispatch({
        changes: { from: match.from, to: match.to, insert: replacement },
        selection: { anchor: match.from + replacement.length },
        scrollIntoView: true,
      });
    }
    lastSearchQuery = '';
    performFind(query, matchCase, 'stay');
  }
}

function handleReplaceAll(e: Event) {
  const custom = e as CustomEvent<{ query: string; replacement: string; matchCase: boolean }>;
  const { query, replacement, matchCase } = custom.detail;
  const isLive = docsStore.activeDocument?.mode === 'live';

  if (isLive) {
    const view = liveEditorInstance?.getView();
    if (!view) return;
    lastSearchQuery = '';
    performFind(query, matchCase, 'stay');
    if (currentMatches.length > 0) {
      let tr = view.state.tr;
      for (let i = currentMatches.length - 1; i >= 0; i--) {
        tr = tr.insertText(replacement, currentMatches[i].from, currentMatches[i].to);
      }
      view.dispatch(tr);
      lastSearchQuery = '';
      performFind(query, matchCase, 'stay');
    }
  } else {
    const cm = sourceEditorInstance?.view;
    if (!cm) return;
    lastSearchQuery = '';
    performFind(query, matchCase, 'stay');
    if (currentMatches.length > 0) {
      const changes = currentMatches.map((m) => ({
        from: m.from,
        to: m.to,
        insert: replacement,
      }));
      cm.dispatch({ changes });
      lastSearchQuery = '';
      performFind(query, matchCase, 'stay');
    }
  }
}

function handleRemountDoc(e: Event) {
  const custom = e as CustomEvent<{ id: string }>;
  if (custom.detail?.id === docsStore.activeDocumentId) {
    currentMountedDocId = null;
    mountEditor();
  }
}

onMounted(() => {
  mountEditor();
  window.addEventListener('editor:remount-doc', handleRemountDoc);
  window.addEventListener('editor:navigate-heading', handleNavigateHeading);
  window.addEventListener('editor:action', handleEditorAction);
  window.addEventListener('editor:find-query', handleFindQuery);
  window.addEventListener('editor:find-next', handleFindNext);
  window.addEventListener('editor:find-prev', handleFindPrev);
  window.addEventListener('editor:replace', handleReplace);
  window.addEventListener('editor:replace-all', handleReplaceAll);
  if (containerRef.value?.parentElement) {
    containerRef.value.parentElement.addEventListener('wheel', handleEditorWheel, { passive: false });
  }
});

onUnmounted(() => {
  destroyCurrentEditor();
  window.removeEventListener('editor:remount-doc', handleRemountDoc);
  window.removeEventListener('editor:navigate-heading', handleNavigateHeading);
  window.removeEventListener('editor:action', handleEditorAction);
  window.removeEventListener('editor:find-query', handleFindQuery);
  window.removeEventListener('editor:find-next', handleFindNext);
  window.removeEventListener('editor:find-prev', handleFindPrev);
  window.removeEventListener('editor:replace', handleReplace);
  window.removeEventListener('editor:replace-all', handleReplaceAll);
  if (containerRef.value?.parentElement) {
    containerRef.value.parentElement.removeEventListener('wheel', handleEditorWheel);
  }
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }
});
</script>

<template>
  <div
    class="editor-host-container"
    data-file-drop-target
    :class="{
      'focus-mode': uiStore.focusMode,
      'typewriter-mode': uiStore.typewriterMode,
    }"
    @click="handleContainerClick"
    @contextmenu.prevent="handleContextMenu"
  >
    <div ref="containerRef" class="editor-mount-point markdown-body" data-file-drop-target></div>

    <!-- Typora-like Right-Click Context Menu -->
    <EditorContextMenu
      v-if="contextMenuVisible"
      :x="contextMenuPos.x"
      :y="contextMenuPos.y"
      @close="contextMenuVisible = false"
      @action="handleContextMenuAction"
    />
  </div>
</template>

<style scoped>
.editor-host-container {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  isolation: isolate;
  background-color: var(--bg);
  cursor: text;
  transition: opacity var(--duration-claude) var(--ease-claude);
}

.editor-mount-point {
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  outline: none;
}

/* Focus Mode (Chapter 7.8) */
.focus-mode :deep(.milkdown .ProseMirror > *:not(.ProseMirror-selectednode):not(:focus-within)),
.focus-mode :deep(.cm-content > *:not(.cm-activeLine)) {
  opacity: 0.3 !important;
  transition: opacity var(--duration-claude) var(--ease-claude);
}

/* Typewriter Mode (Chapter 7.8) */
.typewriter-mode {
  scroll-behavior: smooth;
  padding-bottom: 60vh;
}
</style>
