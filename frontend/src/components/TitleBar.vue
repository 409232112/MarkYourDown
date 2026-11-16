<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useDocumentsStore } from '../stores/documents';
import { useWorkspaceStore } from '../stores/workspace';
import { useSettingsStore, type ThemeType } from '../stores/settings';
import { useUiStore } from '../stores/ui';
import { windowApi, fileApi, exportApi } from '../api';
import { i18n } from '../i18n/zh-CN';
import TabBar from './TabBar.vue';

const docsStore = useDocumentsStore();
const wsStore = useWorkspaceStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const activeMenu = ref<string | null>(null);

const documentTitle = computed(() => {
  const doc = docsStore.activeDocument;
  if (!doc) return '';
  const dirtyMark = doc.status !== 'clean' ? ' *' : '';
  return `${doc.title}${dirtyMark}`;
});

function toggleMenu(menu: string) {
  if (activeMenu.value === menu) {
    activeMenu.value = null;
  } else {
    activeMenu.value = menu;
  }
}

function handleMenuHover(menu: string) {
  if (activeMenu.value !== null) {
    activeMenu.value = menu;
  }
}

function closeMenu() {
  activeMenu.value = null;
}

// Window Controls
function handleMinimize() {
  windowApi.minimize();
}

function handleMaximize() {
  windowApi.toggleMaximize();
}

function handleClose() {
  const dirtyDoc = docsStore.documents.find((d) => d.status === 'dirty');
  if (dirtyDoc) {
    docsStore.requestCloseDocument(dirtyDoc.id, () => {
      handleClose();
    });
  } else {
    windowApi.close();
  }
}

// File actions
async function handleNewFile() {
  closeMenu();
  docsStore.createNewDocument();
}

async function handleOpenFile() {
  closeMenu();
  const file = await fileApi.openFileDialog();
  if (file) {
    docsStore.openDocument(file);
  }
}

async function handleOpenFolder() {
  closeMenu();
  await wsStore.openFolder();
}

async function handleSave() {
  closeMenu();
  if (docsStore.activeDocumentId) {
    const success = await docsStore.saveDocument(docsStore.activeDocumentId);
    if (success) {
      uiStore.flashStatus(i18n.app.saved);
    }
  }
}

async function handleSaveAs() {
  closeMenu();
  if (docsStore.activeDocumentId) {
    const success = await docsStore.saveAsDocument(docsStore.activeDocumentId);
    if (success) {
      uiStore.flashStatus(i18n.app.saved);
    }
  }
}

async function handleExportHtml() {
  closeMenu();
  if (docsStore.activeDocument) {
    const docPath = docsStore.activeDocument.path || '';
    const res = await exportApi.exportDocumentToHtml(
      docsStore.activeDocument.title,
      docsStore.activeDocument.content,
      {
        theme: settingsStore.settings.theme === 'night' ? 'night' : 'warm',
        includeToc: false,
        imageResolver: async (src: string) => {
          return await fileApi.resolveImageAsDataUrl(docPath, src);
        },
      }
    );
    if (res.success && res.targetPath) {
      uiStore.flashExported(res.targetPath);
    }
  }
}

function handleCloseTab() {
  closeMenu();
  if (docsStore.activeDocumentId) {
    docsStore.requestCloseDocument(docsStore.activeDocumentId);
  }
}

function handleThemeChange(t: ThemeType) {
  closeMenu();
  settingsStore.setTheme(t);
}

function triggerEditorAction(action: string, payload?: any) {
  closeMenu();
  window.dispatchEvent(
    new CustomEvent('editor:action', {
      detail: { action, payload },
    })
  );
}

function handleTitlebarDblClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('.menu-trigger') || target.closest('.win-btn') || target.closest('.tab-item')) {
    return;
  }
  windowApi.toggleMaximize();
}

function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.title-menu-container')) {
    activeMenu.value = null;
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && activeMenu.value) {
    activeMenu.value = null;
  }
}

onMounted(() => {
  window.addEventListener('click', handleGlobalClick);
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick);
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <header class="titlebar wails-drag" @dblclick="handleTitlebarDblClick">
    <!-- Brand / Logo on far left -->
    <div class="app-brand wails-no-drag" title="关于 MarkYourDown" @click="uiStore.openAbout()">
      <img class="brand-logo-img" src="/wails.png" alt="MarkYourDown" />
      <span class="brand-name-text">MarkYourDown</span>
    </div>

    <!-- Left: Menu items -->
    <div class="menu-bar wails-no-drag">
      <!-- File -->
      <div class="title-menu-container">
        <button
          class="menu-trigger"
          :class="{ active: activeMenu === 'file' }"
          @click.stop="toggleMenu('file')"
          @mouseenter="handleMenuHover('file')"
        >
          {{ i18n.menu.file }}
        </button>
        <div v-if="activeMenu === 'file'" class="menu-dropdown">
          <div class="menu-item" @click="handleNewFile">
            <span>{{ i18n.menu.newFile }}</span>
            <span class="shortcut">Ctrl+N</span>
          </div>
          <div class="menu-item" @click="handleOpenFile">
            <span>{{ i18n.menu.openFile }}</span>
            <span class="shortcut">Ctrl+O</span>
          </div>
          <div class="menu-item" @click="handleOpenFolder">
            <span>{{ i18n.menu.openFolder }}</span>
            <span class="shortcut">Ctrl+Shift+O</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="handleSave">
            <span>{{ i18n.menu.save }}</span>
            <span class="shortcut">Ctrl+S</span>
          </div>
          <div class="menu-item" @click="handleSaveAs">
            <span>{{ i18n.menu.saveAs }}</span>
            <span class="shortcut">Ctrl+Shift+S</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="handleExportHtml">
            <span>{{ i18n.menu.exportHtmlAction }}</span>
            <span class="shortcut">Ctrl+Shift+E</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="handleCloseTab">
            <span>{{ i18n.menu.closeTab }}</span>
            <span class="shortcut">Ctrl+W</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="handleClose">
            <span>{{ i18n.menu.exit }}</span>
          </div>
        </div>
      </div>

      <!-- Edit -->
      <div class="title-menu-container">
        <button
          class="menu-trigger"
          :class="{ active: activeMenu === 'edit' }"
          @click.stop="toggleMenu('edit')"
          @mouseenter="handleMenuHover('edit')"
        >
          {{ i18n.menu.edit }}
        </button>
        <div v-if="activeMenu === 'edit'" class="menu-dropdown">
          <div class="menu-item" @click="uiStore.openFind('find'); closeMenu()">
            <span>{{ i18n.menu.find }}</span>
            <span class="shortcut">Ctrl+F</span>
          </div>
          <div class="menu-item" @click="uiStore.openFind('replace'); closeMenu()">
            <span>{{ i18n.menu.replace }}</span>
            <span class="shortcut">Ctrl+H</span>
          </div>
        </div>
      </div>

      <!-- Paragraph -->
      <div class="title-menu-container">
        <button
          class="menu-trigger"
          :class="{ active: activeMenu === 'paragraph' }"
          @click.stop="toggleMenu('paragraph')"
          @mouseenter="handleMenuHover('paragraph')"
        >
          {{ i18n.menu.paragraph }}
        </button>
        <div v-if="activeMenu === 'paragraph'" class="menu-dropdown">
          <div class="menu-item" @click="triggerEditorAction('paragraph')">
            <span>{{ i18n.menu.paragraphText }}</span>
            <span class="shortcut">Ctrl+0</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('heading', 1)">
            <span>{{ i18n.menu.heading1 }}</span>
            <span class="shortcut">Ctrl+1</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('heading', 2)">
            <span>{{ i18n.menu.heading2 }}</span>
            <span class="shortcut">Ctrl+2</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('heading', 3)">
            <span>{{ i18n.menu.heading3 }}</span>
            <span class="shortcut">Ctrl+3</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="triggerEditorAction('table')">
            <span>{{ i18n.menu.table }}</span>
            <span class="shortcut">Ctrl+T</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('code')">
            <span>{{ i18n.menu.codeBlock }}</span>
            <span class="shortcut">Ctrl+Shift+K</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('math')">
            <span>{{ i18n.menu.mathBlock }}</span>
            <span class="shortcut">Ctrl+Shift+M</span>
          </div>
        </div>
      </div>

      <!-- Format -->
      <div class="title-menu-container">
        <button
          class="menu-trigger"
          :class="{ active: activeMenu === 'format' }"
          @click.stop="toggleMenu('format')"
          @mouseenter="handleMenuHover('format')"
        >
          {{ i18n.menu.format }}
        </button>
        <div v-if="activeMenu === 'format'" class="menu-dropdown">
          <div class="menu-item" @click="triggerEditorAction('bold')">
            <span>{{ i18n.menu.bold }}</span>
            <span class="shortcut">Ctrl+B</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('italic')">
            <span>{{ i18n.menu.italic }}</span>
            <span class="shortcut">Ctrl+I</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('underline')">
            <span>{{ i18n.menu.underline }}</span>
            <span class="shortcut">Ctrl+U</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('inlineCode')">
            <span>{{ i18n.menu.inlineCode }}</span>
            <span class="shortcut">Ctrl+Shift+`</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('link')">
            <span>{{ i18n.menu.hyperlink }}</span>
            <span class="shortcut">Ctrl+K</span>
          </div>
          <div class="menu-item" @click="triggerEditorAction('image')">
            <span>{{ i18n.menu.image }}</span>
            <span class="shortcut">Ctrl+Shift+I</span>
          </div>
        </div>
      </div>

      <!-- View -->
      <div class="title-menu-container">
        <button
          class="menu-trigger"
          :class="{ active: activeMenu === 'view' }"
          @click.stop="toggleMenu('view')"
          @mouseenter="handleMenuHover('view')"
        >
          {{ i18n.menu.view }}
        </button>
        <div v-if="activeMenu === 'view'" class="menu-dropdown">
          <div class="menu-item" @click="uiStore.toggleSidebar(); closeMenu()">
            <span>{{ i18n.menu.toggleSidebar }}</span>
            <span class="shortcut">Ctrl+Shift+L</span>
          </div>
          <div class="menu-item" @click="uiStore.setSidebarTab('outline'); closeMenu()">
            <span>{{ i18n.menu.outlineView }}</span>
            <span class="shortcut">Ctrl+Shift+1</span>
          </div>
          <div class="menu-item" @click="uiStore.setSidebarTab('files'); closeMenu()">
            <span>{{ i18n.menu.filesView }}</span>
            <span class="shortcut">Ctrl+Shift+2</span>
          </div>
          <div class="menu-divider"></div>
          <div
            class="menu-item"
            @click="
              if (docsStore.activeDocument) {
                docsStore.activeDocument.mode = docsStore.activeDocument.mode === 'live' ? 'source' : 'live';
              }
              closeMenu();
            "
          >
            <span>{{ i18n.menu.sourceMode }}</span>
            <span class="shortcut">Ctrl+/</span>
          </div>
          <div class="menu-item" @click="uiStore.toggleFocusMode(); closeMenu()">
            <span>{{ i18n.menu.focusMode }}</span>
            <span class="shortcut">F8</span>
          </div>
          <div class="menu-item" @click="uiStore.toggleTypewriterMode(); closeMenu()">
            <span>{{ i18n.menu.typewriterMode }}</span>
            <span class="shortcut">F9</span>
          </div>
          <div class="menu-divider"></div>
          <div
            class="menu-item"
            @click="settingsStore.setContentWidth(0); closeMenu()"
          >
            <span>自适应全宽 (100%)</span>
            <span v-if="settingsStore.settings.contentWidth <= 0" class="shortcut">✓</span>
          </div>
          <div
            class="menu-item"
            @click="settingsStore.setContentWidth(1400); closeMenu()"
          >
            <span>超宽版心 (1400px)</span>
            <span v-if="settingsStore.settings.contentWidth === 1400" class="shortcut">✓</span>
          </div>
          <div
            class="menu-item"
            @click="settingsStore.setContentWidth(1200); closeMenu()"
          >
            <span>宽屏版心 (1200px)</span>
            <span v-if="settingsStore.settings.contentWidth === 1200" class="shortcut">✓</span>
          </div>
          <div
            class="menu-item"
            @click="settingsStore.setContentWidth(1000); closeMenu()"
          >
            <span>标准版心 (1000px)</span>
            <span v-if="settingsStore.settings.contentWidth === 1000" class="shortcut">✓</span>
          </div>
          <div
            class="menu-item"
            @click="settingsStore.setContentWidth(800); closeMenu()"
          >
            <span>紧凑版心 (800px)</span>
            <span v-if="settingsStore.settings.contentWidth === 800" class="shortcut">✓</span>
          </div>
        </div>
      </div>

      <!-- Theme -->
      <div class="title-menu-container">
        <button
          class="menu-trigger"
          :class="{ active: activeMenu === 'theme' }"
          @click.stop="toggleMenu('theme')"
          @mouseenter="handleMenuHover('theme')"
        >
          {{ i18n.menu.theme }}
        </button>
        <div v-if="activeMenu === 'theme'" class="menu-dropdown">
          <div class="menu-item" @click="handleThemeChange('warm')">
            <span>{{ i18n.menu.themeWarm }}</span>
            <span v-if="settingsStore.settings.theme === 'warm'" class="shortcut">✓</span>
          </div>
          <div class="menu-item" @click="handleThemeChange('night')">
            <span>{{ i18n.menu.themeNight }}</span>
            <span v-if="settingsStore.settings.theme === 'night'" class="shortcut">✓</span>
          </div>
          <div class="menu-item" @click="handleThemeChange('plain')">
            <span>{{ i18n.menu.themePlain }}</span>
            <span v-if="settingsStore.settings.theme === 'plain'" class="shortcut">✓</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="handleThemeChange('system')">
            <span>{{ i18n.menu.themeSystem }}</span>
            <span v-if="settingsStore.settings.theme === 'system'" class="shortcut">✓</span>
          </div>
        </div>
      </div>

      <!-- Help -->
      <div class="title-menu-container">
        <button
          class="menu-trigger"
          :class="{ active: activeMenu === 'help' }"
          @click.stop="toggleMenu('help')"
          @mouseenter="handleMenuHover('help')"
        >
          {{ i18n.menu.help }}
        </button>
        <div v-if="activeMenu === 'help'" class="menu-dropdown">
          <div class="menu-item" @click="uiStore.openSettings('general'); closeMenu()">
            <span>{{ i18n.menu.settings }}</span>
            <span class="shortcut">Ctrl+,</span>
          </div>
          <div class="menu-item" @click="uiStore.openAbout(); closeMenu()">
            <span>{{ i18n.menu.about }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Center: TabBar when >= 2 documents, or Single Document Title -->
    <div class="title-center">
      <TabBar v-if="docsStore.documents.length >= 2" class="wails-no-drag" />
      <div
        v-else-if="docsStore.documents.length === 1"
        class="single-doc-title"
      >
        {{ documentTitle }}
      </div>
    </div>

    <!-- Right: Frameless Window Controls (Windows native style: ─ □ ✕) -->
    <div class="window-controls wails-no-drag">
      <button class="win-btn win-min" :title="'最小化'" @click="handleMinimize">
        ─
      </button>
      <button class="win-btn win-max" :title="'最大化'" @click="handleMaximize">
        □
      </button>
      <button class="win-btn win-close" :title="'关闭'" @click="handleClose">
        ✕
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  height: 40px;
  background-color: var(--bg-side);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0 12px;
  position: relative;
  z-index: 100;
  user-select: none;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-right: 10px;
  padding: 3px 6px;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: all var(--duration-claude) var(--ease-claude);
}

.app-brand:hover {
  background-color: var(--hover);
}

.brand-logo-img {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: contain;
}

.brand-name-text {
  font-family: var(--font-serif);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.menu-bar {
  display: flex;
  align-items: center;
  gap: 2px;
}

.title-menu-container {
  position: relative;
}

.menu-trigger {
  height: 28px;
  padding: 0 8px;
  font-size: 13px;
  color: var(--text-2);
  border-radius: var(--r-sm);
  background: transparent;
  display: flex;
  align-items: center;
}

.menu-trigger:hover,
.menu-trigger.active {
  color: var(--text);
  background-color: var(--hover);
}

.menu-dropdown {
  position: absolute;
  top: 32px;
  left: 0;
  background-color: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  min-width: 220px;
  z-index: 1000;
  animation: fadeIn 120ms ease-out;
}

.menu-item {
  height: 30px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  white-space: nowrap;
}

.menu-item:hover {
  background-color: var(--hover);
}

.menu-item .shortcut {
  font-size: 11px;
  color: var(--text-3);
  margin-left: 16px;
}

.menu-divider {
  height: 1px;
  background-color: var(--border);
  margin: 4px 0;
}

.title-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  height: 100%;
}

.single-doc-title {
  font-family: var(--font-serif);
  font-size: 14px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
}

.win-btn {
  width: 44px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-2);
  background: transparent;
  border-radius: 0;
  transition: background-color var(--duration-claude) var(--ease-claude);
}

.win-btn:hover {
  background-color: var(--hover);
  color: var(--text);
}

.win-btn.win-close:hover {
  background-color: #e81123;
  color: #ffffff;
}
</style>
