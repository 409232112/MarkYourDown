<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useWorkspaceStore } from '../stores/workspace';
import { useDocumentsStore } from '../stores/documents';
import { useUiStore } from '../stores/ui';
import { fileApi, type WorkspaceItem, type RecentItem } from '../api';
import { i18n } from '../i18n/zh-CN';
import ContextMenu from './ContextMenu.vue';

const wsStore = useWorkspaceStore();
const docsStore = useDocumentsStore();
const uiStore = useUiStore();

// View mode: 'cards' (Typora card list, default) or 'tree' (hierarchical)
const viewMode = ref<'cards' | 'tree'>('cards');
const searchQuery = ref('');
const recentFilesList = ref<RecentItem[]>([]);

// Context menu state
const contextMenuVisible = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });
const contextTarget = ref<WorkspaceItem | null>(null);

// Inline rename / create state
const editingPath = ref<string | null>(null);
const editValue = ref('');
const isNewFile = ref(false);
const isNewFolder = ref(false);
const creationParentPath = ref<string | null>(null);

interface DocCard {
  title: string;
  ext: string;
  path: string;
  folder: string;
  timeStr: string;
  snippet: string;
  active: boolean;
}

function formatTimeAgo(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function getSnippet(content?: string): string {
  if (!content) return '';
  const clean = content
    .replace(/^#+\s+/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[`*_~>|]/g, '')
    .replace(/\r?\n+/g, ' ')
    .trim();
  return clean.slice(0, 110);
}

function normalizePath(p: string): string {
  return (p || '').replace(/\\/g, '/').toLowerCase();
}

function getFileBaseName(p: string): string {
  if (!p) return '';
  const norm = normalizePath(p);
  const parts = norm.split('/').filter(Boolean);
  return parts[parts.length - 1] || norm;
}

function isSameFile(pathA: string, pathB: string): boolean {
  if (!pathA || !pathB) return false;
  const normA = normalizePath(pathA);
  const normB = normalizePath(pathB);
  if (normA === normB) return true;
  const baseA = getFileBaseName(normA);
  const baseB = getFileBaseName(normB);
  if (baseA === baseB && baseA !== '') {
    if (!normA.includes('/') || !normB.includes('/') || normA.endsWith('/' + baseB) || normB.endsWith('/' + baseA)) {
      return true;
    }
  }
  return false;
}

function extractFolder(path: string): string {
  if (!path) return 'MarkYourDown';
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return wsStore.currentFolder ? wsStore.currentFolder.name : '文档';
}

function splitTitleAndExt(filename: string): { title: string; ext: string } {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot > 0) {
    return {
      title: filename.slice(0, lastDot),
      ext: filename.slice(lastDot + 1),
    };
  }
  return { title: filename, ext: 'md' };
}

// Flatten workspace files
function flattenWorkspaceFiles(items: WorkspaceItem[], list: WorkspaceItem[] = []): WorkspaceItem[] {
  for (const item of items) {
    if (!item.isDir) {
      list.push(item);
    }
    if (item.children && item.children.length > 0) {
      flattenWorkspaceFiles(item.children, list);
    }
  }
  return list;
}

// Document cards computed
const allDocCards = computed<DocCard[]>(() => {
  const cards: DocCard[] = [];

  function findExisting(targetPath: string, targetTitle: string): DocCard | undefined {
    return cards.find((c) => {
      if (isSameFile(c.path, targetPath)) return true;
      const cBase = getFileBaseName(c.path);
      const tBase = getFileBaseName(targetPath);
      if (cBase && tBase && cBase === tBase) return true;
      if (c.title.toLowerCase() === targetTitle.toLowerCase() && c.ext === splitTitleAndExt(targetPath).ext) return true;
      return false;
    });
  }

  // 1. Currently opened documents in docsStore
  for (const doc of docsStore.documents) {
    const filePath = doc.path || doc.title;
    const { title, ext } = splitTitleAndExt(doc.title);
    const existing = findExisting(filePath, title);
    if (!existing) {
      cards.push({
        title,
        ext,
        path: filePath,
        folder: doc.path ? extractFolder(doc.path) : '未命名',
        timeStr: formatTimeAgo(doc.disk?.mtimeMs),
        snippet: getSnippet(doc.content),
        active: doc.id === docsStore.activeDocumentId,
      });
    } else {
      if (doc.id === docsStore.activeDocumentId) {
        existing.active = true;
      }
    }
  }

  // 2. Workspace items if opened
  if (wsStore.fileTree.length > 0) {
    const flatFiles = flattenWorkspaceFiles(wsStore.fileTree);
    for (const file of flatFiles) {
      const { title, ext } = splitTitleAndExt(file.name);
      const existing = findExisting(file.path, title);
      if (!existing) {
        cards.push({
          title,
          ext,
          path: file.path,
          folder: extractFolder(file.path),
          timeStr: '',
          snippet: '',
          active: docsStore.activeDocument?.path ? isSameFile(docsStore.activeDocument.path, file.path) : false,
        });
      }
    }
  }

  // 3. Recent files from history
  for (const rec of recentFilesList.value) {
    const { title, ext } = splitTitleAndExt(rec.title);
    const existing = findExisting(rec.path, title);
    if (!existing) {
      cards.push({
        title,
        ext,
        path: rec.path,
        folder: extractFolder(rec.path),
        timeStr: formatTimeAgo(rec.accessedAt),
        snippet: '',
        active: docsStore.activeDocument?.path ? isSameFile(docsStore.activeDocument.path, rec.path) : false,
      });
    }
  }

  // Ensure active card is always placed at the top (index 0)
  const activeIdx = cards.findIndex((c) => c.active);
  if (activeIdx > 0) {
    const [activeCard] = cards.splice(activeIdx, 1);
    cards.unshift(activeCard);
  }

  return cards;
});

const filteredCards = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return allDocCards.value;
  return allDocCards.value.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.folder.toLowerCase().includes(q) ||
      c.snippet.toLowerCase().includes(q)
  );
});

async function loadRecents() {
  try {
    const items = await fileApi.getRecentFiles();
    recentFilesList.value = items || [];
  } catch (e) {
    console.warn('Failed to load recent files', e);
  }
}

async function handleCardClick(card: DocCard) {
  // Check if already open
  const openDoc = docsStore.documents.find(
    (d) =>
      d.id === card.path ||
      (d.path && isSameFile(d.path, card.path)) ||
      getFileBaseName(d.title) === getFileBaseName(card.path)
  );
  if (openDoc) {
    docsStore.switchDocument(openDoc.id);
    return;
  }

  // Try opening from disk
  const docId = await docsStore.openFileFromPath(card.path);
  if (!docId) {
    uiStore.flashStatus(`文件不存在或已被删除：${card.title}`);
    await fileApi.removeRecentFile(card.path);
    recentFilesList.value = recentFilesList.value.filter(
      (r) => !isSameFile(r.path, card.path) && r.title !== card.title
    );
  }
}

function handleRootClick() {
  if (wsStore.currentFolder) {
    wsStore.revealInExplorer(wsStore.currentFolder.path);
  }
}

function handleItemClick(item: WorkspaceItem) {
  if (item.isDir) {
    wsStore.toggleFolder(item.path);
  } else {
    wsStore.selectedPath = item.path;
    docsStore.openFileFromPath(item.path);
  }
}

function handleContextMenu(e: MouseEvent, item: WorkspaceItem) {
  e.preventDefault();
  e.stopPropagation();
  contextTarget.value = item;
  contextMenuPos.value = { x: e.clientX, y: e.clientY };
  contextMenuVisible.value = true;
}

function handleBackgroundContextMenu(e: MouseEvent) {
  e.preventDefault();
  if (!wsStore.currentFolder) return;
  contextTarget.value = {
    name: wsStore.currentFolder.name,
    path: wsStore.currentFolder.path,
    isDir: true,
  };
  contextMenuPos.value = { x: e.clientX, y: e.clientY };
  contextMenuVisible.value = true;
}

function startRename(item: WorkspaceItem) {
  contextMenuVisible.value = false;
  editingPath.value = item.path;
  editValue.value = item.name;
}

function startNewFile(parentItem: WorkspaceItem) {
  contextMenuVisible.value = false;
  creationParentPath.value = parentItem.isDir ? parentItem.path : wsStore.currentFolder?.path || '';
  isNewFile.value = true;
  editValue.value = '';
}

function startNewFolder(parentItem: WorkspaceItem) {
  contextMenuVisible.value = false;
  creationParentPath.value = parentItem.isDir ? parentItem.path : wsStore.currentFolder?.path || '';
  isNewFolder.value = true;
  editValue.value = '';
}

async function finishEdit() {
  const val = editValue.value.trim();
  if (isNewFile.value && creationParentPath.value && val) {
    const filename = val.endsWith('.md') ? val : `${val}.md`;
    await wsStore.createFile(creationParentPath.value, filename);
  } else if (isNewFolder.value && creationParentPath.value && val) {
    await wsStore.createFolder(creationParentPath.value, val);
  } else if (editingPath.value && val) {
    const item = contextTarget.value;
    if (item && item.name !== val) {
      await wsStore.renameItem(item.path, val);
    }
  }

  editingPath.value = null;
  isNewFile.value = false;
  isNewFolder.value = false;
  creationParentPath.value = null;
}

function cancelEdit() {
  editingPath.value = null;
  isNewFile.value = false;
  isNewFolder.value = false;
  creationParentPath.value = null;
}

function confirmDelete(item: WorkspaceItem) {
  contextMenuVisible.value = false;
  uiStore.showConfirm({
    title: i18n.dialog.deleteTitle,
    message: i18n.dialog.deleteMessage.replace('{name}', item.name),
    confirmText: i18n.dialog.moveToRecycleBin,
    cancelText: i18n.dialog.cancel,
    onConfirm: async () => {
      await wsStore.deleteItem(item.path);
    },
  });
}

function isDocActive(item: WorkspaceItem): boolean {
  if (!docsStore.activeDocument || !docsStore.activeDocument.path) return false;
  return docsStore.activeDocument.path.toLowerCase() === item.path.toLowerCase();
}

onMounted(() => {
  loadRecents();
});
</script>

<template>
  <div class="file-panel" @contextmenu="handleBackgroundContextMenu">
    <!-- Top Action & Search Bar -->
    <div class="panel-top-bar">
      <div class="folder-action-row">
        <button
          class="folder-btn"
          :title="wsStore.currentFolder ? wsStore.currentFolder.path : '点击打开文件夹'"
          @click="wsStore.openFolder"
        >
          <span class="folder-label">{{ wsStore.currentFolder ? wsStore.currentFolder.name : '打开文件夹...' }}</span>
        </button>

        <div class="top-actions">
          <button
            class="action-icon-btn"
            title="新建文档"
            @click="docsStore.createNewDocument()"
          >
            +
          </button>
          <button
            v-if="wsStore.currentFolder"
            class="action-icon-btn"
            :title="viewMode === 'cards' ? '切换为树状视图' : '切换为卡片视图'"
            @click="viewMode = viewMode === 'cards' ? 'tree' : 'cards'"
          >
            {{ viewMode === 'cards' ? '🗂' : '☰' }}
          </button>
        </div>
      </div>

      <!-- Search Input -->
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          class="file-search-input"
          placeholder="筛选或搜索文档..."
        />
      </div>
    </div>

    <!-- Mode 1: Typora-Style Document Cards List (Default) -->
    <div v-if="viewMode === 'cards'" class="doc-card-list">
      <div
        v-for="card in filteredCards"
        :key="card.path"
        class="doc-card"
        :class="{ active: card.active }"
        @click="handleCardClick(card)"
      >
        <div class="card-header">
          <span class="card-folder" :title="card.folder">{{ card.folder }}</span>
          <span class="card-time">{{ card.timeStr }}</span>
        </div>
        <div class="card-title-row">
          <span class="card-title" :title="card.title">{{ card.title }}</span>
          <span class="card-ext">{{ card.ext }}</span>
        </div>
        <div class="card-snippet">
          {{ card.snippet || 'Markdown 文档' }}
        </div>
      </div>

      <div v-if="filteredCards.length === 0" class="cards-empty">
        <span>暂无文档</span>
      </div>
    </div>

    <!-- Mode 2: Tree View (When folder is opened) -->
    <div v-else class="file-tree">
      <div v-if="isNewFile || isNewFolder" class="inline-edit-row">
        <span class="tree-icon">{{ isNewFolder ? '▸ ' : '· ' }}</span>
        <input
          v-model="editValue"
          autofocus
          class="inline-input"
          :placeholder="isNewFolder ? i18n.sidebar.newFolder : i18n.sidebar.newFile"
          @keydown.enter="finishEdit"
          @keydown.escape="cancelEdit"
          @blur="finishEdit"
        />
      </div>

      <div
        v-for="item in wsStore.fileTree"
        :key="item.path"
        class="tree-node"
        :class="{ active: isDocActive(item) }"
        @click="handleItemClick(item)"
        @contextmenu="handleContextMenu($event, item)"
      >
        <template v-if="editingPath === item.path">
          <input
            v-model="editValue"
            autofocus
            class="inline-input"
            @keydown.enter="finishEdit"
            @keydown.escape="cancelEdit"
            @blur="finishEdit"
            @click.stop
          />
        </template>
        <template v-else>
          <span v-if="item.isDir" class="folder-tree-icon">
            {{ wsStore.isExpanded(item.path) ? '▾' : '▸' }}
          </span>
          <span v-else class="file-bullet">·</span>
          <span class="node-name" :title="item.name">{{ item.name }}</span>
        </template>
      </div>
    </div>

    <!-- Right-click Context Menu -->
    <ContextMenu
      v-if="contextMenuVisible"
      :x="contextMenuPos.x"
      :y="contextMenuPos.y"
      @close="contextMenuVisible = false"
    >
      <template v-if="contextTarget">
        <div class="menu-item" @click="startNewFile(contextTarget!)">
          {{ i18n.sidebar.newFile }}
        </div>
        <div class="menu-item" @click="startNewFolder(contextTarget!)">
          {{ i18n.sidebar.newFolder }}
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item" @click="startRename(contextTarget!)">
          {{ i18n.sidebar.rename }}
        </div>
        <div class="menu-item danger" @click="confirmDelete(contextTarget!)">
          {{ i18n.sidebar.deleteToRecycle }}
        </div>
        <div class="menu-divider"></div>
        <div
          class="menu-item"
          @click="wsStore.revealInExplorer(contextTarget!.path); contextMenuVisible = false"
        >
          {{ i18n.sidebar.revealInExplorer }}
        </div>
        <div
          class="menu-item"
          @click="wsStore.copyPath(contextTarget!.path); contextMenuVisible = false"
        >
          {{ i18n.sidebar.copyPath }}
        </div>
      </template>
    </ContextMenu>
  </div>
</template>

<style scoped>
.file-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  user-select: none;
  background-color: var(--bg-side, #F0EEE6);
}

.panel-top-bar {
  padding: 8px 12px 6px 12px;
  border-bottom: 1px solid var(--border, #E6E3D8);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.folder-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.folder-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--r-xs, 4px);
  color: var(--text, #2B2A26);
  font-size: 12px;
  font-weight: 500;
  max-width: 170px;
  overflow: hidden;
  transition: background-color var(--duration-fast, 120ms);
}

.folder-btn:hover {
  background-color: var(--hover, rgba(31, 30, 29, 0.05));
}

.folder-icon {
  font-size: 13px;
}

.folder-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-icon-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border, #E6E3D8);
  border-radius: var(--r-xs, 4px);
  color: var(--text-2, #6F6D66);
  cursor: pointer;
  font-size: 12px;
  transition: background-color var(--duration-fast, 120ms);
}

.action-icon-btn:hover {
  background-color: var(--surface, #FAF9F5);
  color: var(--text, #2B2A26);
}

.search-box {
  width: 100%;
}

.file-search-input {
  width: 100%;
  height: 24px;
  background-color: var(--surface, #FAF9F5);
  border: 1px solid var(--border, #E6E3D8);
  border-radius: var(--r-xs, 4px);
  padding: 0 8px;
  font-size: 11px;
  color: var(--text, #2B2A26);
  outline: none;
}

.file-search-input:focus {
  border-color: var(--accent, #C96442);
}

/* Typora Document Cards List */
.doc-card-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
}

.doc-card {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border, #E6E3D8);
  cursor: pointer;
  transition: background-color var(--duration-fast, 120ms);
  display: flex;
  flex-direction: column;
  gap: 3px;
  position: relative;
}

.doc-card:hover {
  background-color: var(--hover, rgba(31, 30, 29, 0.05));
}

.doc-card.active {
  background-color: var(--accent-soft, rgba(201, 100, 66, 0.1));
  border-left: 3px solid var(--accent, #C96442);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-3, #9C9A92);
}

.card-folder {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
}

.card-time {
  white-space: nowrap;
  font-size: 10px;
}

.card-title-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.card-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text, #2B2A26);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.card-ext {
  font-size: 11px;
  color: var(--text-3, #9C9A92);
  font-weight: normal;
}

.card-snippet {
  font-size: 11px;
  color: var(--text-2, #6F6D66);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.cards-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-3, #9C9A92);
  font-size: 12px;
}

/* Tree View */
.file-tree {
  overflow-y: auto;
  flex: 1;
  padding: 6px 0;
}

.tree-node {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text);
  gap: 6px;
}

.tree-node:hover {
  background-color: var(--hover);
}

.tree-node.active {
  background-color: var(--accent-soft);
  color: var(--accent);
  font-weight: 500;
}

.folder-tree-icon {
  font-size: 10px;
  color: var(--text-3);
  width: 12px;
}

.file-bullet {
  font-size: 14px;
  color: var(--text-3);
  width: 12px;
}

.node-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inline-edit-row {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0 12px;
  gap: 6px;
}

.inline-input {
  flex: 1;
  height: 22px;
  background-color: var(--bg);
  border: 1px solid var(--accent);
  border-radius: var(--r-xs);
  padding: 0 4px;
  font-size: 12px;
  outline: none;
}

.menu-item {
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}

.menu-item:hover {
  background-color: var(--hover);
}

.menu-item.danger {
  color: #c94242;
}

.menu-divider {
  height: 1px;
  background-color: var(--border);
  margin: 4px 0;
}
</style>
