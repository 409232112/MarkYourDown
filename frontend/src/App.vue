<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useDocumentsStore } from './stores/documents';
import { useWorkspaceStore } from './stores/workspace';
import { useSettingsStore } from './stores/settings';
import { useUiStore } from './stores/ui';
import { fileApi, exportApi, backupApi } from './api';
import { i18n } from './i18n/zh-CN';

import TitleBar from './components/TitleBar.vue';
import Sidebar from './components/Sidebar.vue';
import StatusBar from './components/StatusBar.vue';
import NoticeBar from './components/NoticeBar.vue';
import HtmlImportNotice from './components/HtmlImportNotice.vue';
import FindBar from './components/FindBar.vue';
import Welcome from './components/Welcome.vue';
import EditorHost from './components/EditorHost.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import Dialog from './components/Dialog.vue';
import ImageModal from './components/ImageModal.vue';
import AboutDialog from './components/AboutDialog.vue';
import { Events as WailsEvents } from '@wailsio/runtime';

const docsStore = useDocumentsStore();
const wsStore = useWorkspaceStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

let unregOpenFile: (() => void) | null = null;
let unregOpenWorkspace: (() => void) | null = null;
let unregFileChanged: (() => void) | null = null;

function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!((window as any)._wails || (window as any).chrome?.webview || (window as any).wails);
}

// Drag & Drop handling (Chapter 6.4)
// In Wails desktop app, Wails runtime uses [data-file-drop-target] to capture native file drops,
// passes absolute OS paths to Go, and emits 'app:open-file' or 'app:open-workspace'.
function handleDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
}

async function handleDrop(e: DragEvent) {
  e.preventDefault();

  // In desktop environments (Wails / WebView2), file drops are exclusively handled
  // and authorized by Go backend via WindowFilesDropped, emitting 'app:open-file'.
  // Do NOT process or call openFileFromPath from DOM drop to avoid double-opening or bypassing backend authorization.
  if (isDesktopApp()) {
    return;
  }

  if (!e.dataTransfer) return;

  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  // Pure browser/mock mode fallback (without desktop filesystem)
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const lowerName = file.name.toLowerCase();
    if (
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.markdown') ||
      lowerName.endsWith('.mdown') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.html') ||
      lowerName.endsWith('.htm')
    ) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = (reader.result as string) || '';
        docsStore.openDocument({
          id: `doc-${Date.now()}-${i}`,
          path: '',
          title: file.name,
          content,
          format: /\.html?$/i.test(file.name) ? 'html' : 'markdown',
          encoding: 'utf8',
          eol: content.includes('\r\n') ? 'crlf' : 'lf',
          mtimeMs: file.lastModified || Date.now(),
          size: file.size,
          hash: `hash-${Date.now()}-${file.size}`,
        });
      };
      reader.readAsText(file);
    }
  }
}

// Global Keyboard Shortcuts (Chapter 6.8)
function handleGlobalKeydown(e: KeyboardEvent) {
  const isCtrlOrMeta = e.ctrlKey || e.metaKey;

  // F8: Focus Mode
  if (e.key === 'F8') {
    e.preventDefault();
    uiStore.toggleFocusMode();
    return;
  }

  // F9: Typewriter Mode
  if (e.key === 'F9') {
    e.preventDefault();
    uiStore.toggleTypewriterMode();
    return;
  }

  // Settings: Ctrl+,
  if (isCtrlOrMeta && e.key === ',') {
    e.preventDefault();
    uiStore.openSettings('general');
    return;
  }

  // New File: Ctrl+N
  if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    docsStore.createNewDocument();
    return;
  }

  // Open File: Ctrl+O
  if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    fileApi.openFileDialog().then((info) => {
      if (info) docsStore.openDocument(info);
    });
    return;
  }

  // Open Folder: Ctrl+Shift+O
  if (isCtrlOrMeta && e.shiftKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    wsStore.openFolder();
    return;
  }

  // Save: Ctrl+S
  if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (docsStore.activeDocumentId) {
      docsStore.saveDocument(docsStore.activeDocumentId);
    }
    return;
  }

  // Save As: Ctrl+Shift+S
  if (isCtrlOrMeta && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (docsStore.activeDocumentId) {
      docsStore.saveAsDocument(docsStore.activeDocumentId);
    }
    return;
  }

  // Export HTML: Ctrl+Shift+E
  if (isCtrlOrMeta && e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    if (docsStore.activeDocument?.htmlImport) {
      uiStore.flashStatus('请先另存为 Markdown 后导出');
      return;
    }
    if (docsStore.activeDocument) {
      exportApi
        .exportDocumentToHtml(docsStore.activeDocument.title, docsStore.activeDocument.content, {
          theme: settingsStore.settings.theme === 'night' ? 'night' : 'warm',
          includeToc: settingsStore.settings.htmlIncludeToc,
        })
        .then((res) => {
          if (res.success && res.targetPath) {
            uiStore.flashExported(res.targetPath);
          }
        });
    }
    return;
  }

  // Close Tab: Ctrl+W
  if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 'w') {
    e.preventDefault();
    if (docsStore.activeDocumentId) {
      docsStore.requestCloseDocument(docsStore.activeDocumentId);
    }
    return;
  }

  // Switch Tab: Ctrl+Tab
  if (isCtrlOrMeta && e.key === 'Tab') {
    e.preventDefault();
    if (docsStore.documents.length > 1) {
      const idx = docsStore.documents.findIndex((d) => d.id === docsStore.activeDocumentId);
      const nextIdx = e.shiftKey
        ? (idx - 1 + docsStore.documents.length) % docsStore.documents.length
        : (idx + 1) % docsStore.documents.length;
      docsStore.switchDocument(docsStore.documents[nextIdx].id);
    }
    return;
  }

  // Find: Ctrl+F
  if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    uiStore.openFind('find');
    return;
  }

  // Replace: Ctrl+H
  if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    if (docsStore.activeDocument?.htmlImport) {
      uiStore.openFind('find');
      uiStore.flashStatus('另存为 Markdown 后可替换');
    } else uiStore.openFind('replace');
    return;
  }

  // Toggle Source Mode: Ctrl+/
  if (isCtrlOrMeta && e.key === '/') {
    e.preventDefault();
    if (docsStore.activeDocument) {
      docsStore.activeDocument.mode = docsStore.activeDocument.mode === 'live' ? 'source' : 'live';
    }
    return;
  }

  // Toggle Sidebar: Ctrl+Shift+L
  if (isCtrlOrMeta && e.shiftKey && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    uiStore.toggleSidebar();
    return;
  }

  // Outline Panel: Ctrl+Shift+1
  if (isCtrlOrMeta && e.shiftKey && e.key === '!') {
    e.preventDefault();
    uiStore.setSidebarTab('outline');
    return;
  }

  // File Panel: Ctrl+Shift+2
  if (isCtrlOrMeta && e.shiftKey && e.key === '@') {
    e.preventDefault();
    uiStore.setSidebarTab('files');
    return;
  }
}

onMounted(() => {
  const settingsLoaded = settingsStore.load();
  window.addEventListener('keydown', handleGlobalKeydown);
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('drop', handleDrop);

  try {
    if (WailsEvents && typeof WailsEvents.On === 'function') {
      unregOpenFile = WailsEvents.On('app:open-file', (ev: any) => {
        const path = typeof ev?.data === 'string' ? ev.data : Array.isArray(ev?.data) ? ev.data[0] : (typeof ev === 'string' ? ev : '');
        if (path) {
          docsStore.openFileFromPath(path);
        }
      });

      unregOpenWorkspace = WailsEvents.On('app:open-workspace', (ev: any) => {
        const path = typeof ev?.data === 'string' ? ev.data : Array.isArray(ev?.data) ? ev.data[0] : (typeof ev === 'string' ? ev : '');
        if (path) {
          wsStore.openFolderPath(path);
        }
      });

      unregFileChanged = WailsEvents.On('file:changed', (ev: any) => {
        const path = ev?.data?.path || ev?.data;
        if (path && typeof path === 'string') {
          docsStore.handleExternalFileEvent(path);
        }
      });
    }
  } catch (e) {
    console.warn('WailsEvents.On failed', e);
  }

  // Check crash recovery backups (R2 & R5)
  async function restoreStartup() {
    await settingsLoaded;
    const backups = await backupApi.listBackups();
    if (backups && backups.length > 0) {
      await new Promise<void>((resolve) => {
        const discardAll = () => {
          for (const b of backups) {
            backupApi.removeBackup(b.id);
          }
          uiStore.closeConfirm();
          resolve();
        };

        uiStore.showConfirm({
          title: i18n.dialog.recoveryTitle,
          message: i18n.dialog.recoveryMessage.replace('{n}', String(backups.length)),
          confirmText: i18n.dialog.recoveryConfirm,
          cancelText: i18n.dialog.recoveryCancel,
          onConfirm: async () => {
            for (const b of backups) {
              let targetPath = b.path || '';
              if (targetPath) {
                const ok = await backupApi.authorizeRestoredDraft(b.id);
                if (!ok) {
                  targetPath = ''; // File was deleted or unauthorized, treat as untitled
                }
              }
              docsStore.restoreDraft({
                id: b.id,
                path: targetPath,
                title: b.title || '恢复文档',
                content: b.content || '',
                encoding: b.encoding || 'utf8',
                eol: b.eol || 'crlf',
                mtimeMs: b.savedAt || Date.now(),
                size: (b.content || '').length,
                hash: b.baseHash || '',
              });
            }
            uiStore.closeConfirm();
            resolve();
          },
          onCancel: discardAll,
        });
      });
    }

    // Restore session if configured (R5)
    if (settingsStore.settings.startupAction === 'restore') {
      const session = await backupApi.loadSession();
      if (session && session.tabs && session.tabs.length > 0) {
        let restoredActiveId: string | null = null;
        for (const tab of session.tabs) {
          const source = tab.sourcePath || tab.path;
          if (!source) continue;
          const id = await docsStore.openFileFromPath(source);
          if (!id) {
            if (tab.kind === 'html-preview' || /\.html?$/i.test(source)) uiStore.flashStatus(`无法恢复 HTML：${tab.title || source}`);
            continue;
          }
          const doc = docsStore.documents.find((item) => item.id === id);
          if (doc) {
            if (tab.mode === 'live' || tab.mode === 'source') doc.mode = tab.mode;
            if (tab.cursor !== undefined) doc.cursor = tab.cursor;
            if (typeof tab.scrollTop === 'number') doc.scrollTop = tab.scrollTop;
          }
          if (tab.id === session.activeTabId) restoredActiveId = id;
        }
        if (restoredActiveId) docsStore.switchDocument(restoredActiveId);
        if (session.workspacePath) {
          await wsStore.openFolderPath(session.workspacePath);
        }
      }
    } else if (settingsStore.settings.startupAction === 'blank' && docsStore.documents.length === 0) {
      docsStore.createNewDocument();
    }
  }
  void restoreStartup().catch((error) => console.error('Startup restoration failed', error));

  window.addEventListener('beforeunload', handleBeforeUnload);

  // Check external change on window focus (unified with handleExternalFileEvent)
  window.addEventListener('focus', () => {
    const doc = docsStore.activeDocument;
    const path = doc?.htmlImport?.sourcePath || doc?.path;
    if (path) {
      docsStore.handleExternalFileEvent(path);
    }
  });
});

function handleBeforeUnload() {
  if (settingsStore.settings.startupAction !== 'restore') return;
  window.dispatchEvent(new Event('editor:snapshot-session'));
  const tabs = docsStore.documents.map((d) => ({
    id: d.id,
    path: d.htmlImport?.sourcePath || d.path || '',
    kind: d.htmlImport ? 'html-preview' : 'markdown',
    sourcePath: d.htmlImport?.sourcePath || '',
    cursor: d.cursor,
    scrollTop: d.scrollTop,
    title: d.title,
    mode: d.mode,
  }));
  backupApi.saveSession({
    activeTabId: docsStore.activeDocumentId || '',
    tabs,
    workspacePath: wsStore.currentFolder?.path || '',
    sidebarActive: uiStore.sidebarTab,
    sidebarOpen: uiStore.sidebarVisible,
  });
}

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  window.removeEventListener('dragover', handleDragOver);
  window.removeEventListener('drop', handleDrop);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  unregOpenFile?.();
  unregOpenWorkspace?.();
  unregFileChanged?.();
});
</script>

<template>
  <div class="app-layout" data-file-drop-target>
    <!-- TitleBar (40px) -->
    <TitleBar />

    <!-- Main Workspace (Sidebar + Editor Area) -->
    <div class="workspace-body">
      <!-- Sidebar (Collapsible in Focus Mode) -->
      <Sidebar v-show="!uiStore.focusMode" />

      <!-- Editor Region -->
      <div class="editor-area">
        <!-- Non-modal NoticeBar for conflict/deleted/failed -->
        <NoticeBar />
        <HtmlImportNotice />

        <!-- Floating FindBar -->
        <FindBar />

        <!-- Welcome View when no documents are open -->
        <Welcome v-if="docsStore.documents.length === 0" />

        <!-- Editor Host when document is open -->
        <EditorHost v-else />
      </div>
    </div>

    <!-- StatusBar (28px, hidden in Focus Mode) -->
    <StatusBar v-show="!uiStore.focusMode" />

    <!-- Modals -->
    <SettingsDialog />
    <Dialog />
    <ImageModal />
    <AboutDialog />
  </div>
</template>

<style scoped>
.app-layout {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg);
  position: relative;
}

.workspace-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
  background-color: var(--bg);
  /* Reserve 6px right border zone so window-resize dragging is never intercepted by scrollbar */
  padding-right: 6px;
}
</style>
