<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useDocumentsStore } from '../stores/documents';
import { useWorkspaceStore } from '../stores/workspace';
import { useUiStore } from '../stores/ui';
import { fileApi, type RecentItem } from '../api';
import { i18n } from '../i18n/zh-CN';

const docsStore = useDocumentsStore();
const wsStore = useWorkspaceStore();
const uiStore = useUiStore();

const recentFiles = ref<RecentItem[]>([]);

async function loadRecents() {
  const items = await fileApi.getRecentFiles();
  recentFiles.value = items.slice(0, 8);
}

function handleNewDoc() {
  docsStore.createNewDocument();
}

async function handleOpenFile() {
  const file = await fileApi.openFileDialog();
  if (file) {
    docsStore.openDocument(file);
  }
}

async function handleOpenFolder() {
  await wsStore.openFolder();
}

async function handleRecentClick(item: RecentItem) {
  const docId = await docsStore.openFileFromPath(item.path);
  if (!docId) {
    uiStore.flashStatus(`文件不存在或已被删除：${item.title || item.path}`);
    await fileApi.removeRecentFile(item.path);
    recentFiles.value = recentFiles.value.filter((r) => r.path !== item.path);
  }
}

async function handleClearRecent() {
  await fileApi.clearRecentFiles();
  recentFiles.value = [];
}

onMounted(() => {
  loadRecents();
});
</script>

<template>
  <div class="welcome-container">
    <div class="welcome-content">
      <!-- Brand Heading -->
      <img src="/wails.png" class="welcome-logo" alt="MarkYourDown" />
      <h1 class="brand-title">{{ i18n.welcome.title }}</h1>

      <!-- Action Buttons -->
      <div class="action-row">
        <button class="btn-primary btn-pill" @click="handleNewDoc">
          {{ i18n.welcome.newDoc }}
        </button>
        <button class="btn-secondary btn-pill" @click="handleOpenFile">
          {{ i18n.welcome.openFile }}
        </button>
        <button class="btn-text accent" @click="handleOpenFolder">
          {{ i18n.welcome.openFolder }}
        </button>
      </div>

      <!-- Recent Files Section -->
      <div class="recent-section">
        <div class="recent-header">
          <span class="recent-label">{{ i18n.welcome.recent }}</span>
          <button
            v-if="recentFiles.length > 0"
            class="clear-recent"
            @click="handleClearRecent"
          >
            {{ i18n.welcome.clearRecent }}
          </button>
        </div>

        <div v-if="recentFiles.length > 0" class="recent-list">
          <div
            v-for="item in recentFiles"
            :key="item.path"
            class="recent-item"
            @click="handleRecentClick(item)"
          >
            <span class="recent-title">{{ item.title }}</span>
            <span class="recent-path" :title="item.path">{{ item.path }}</span>
          </div>
        </div>
        <div v-else class="recent-empty">
          {{ i18n.welcome.noRecent }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg);
  user-select: none;
}

.welcome-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 520px;
  width: 100%;
  padding: 40px 24px;
}

.welcome-logo {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  margin-bottom: 32px;
  object-fit: contain;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.08));
}

.brand-title {
  font-family: var(--font-serif);
  font-size: 56px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.1;
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 48px;
}

.recent-section {
  width: 100%;
  border-top: 1px solid var(--border);
  padding-top: 24px;
}

.recent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.recent-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.clear-recent {
  font-size: 11px;
  color: var(--text-3);
  background: transparent;
  cursor: pointer;
}

.clear-recent:hover {
  color: var(--text);
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recent-item {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background-color var(--duration-claude) var(--ease-claude);
}

.recent-item:hover {
  background-color: var(--hover);
}

.recent-title {
  font-family: var(--font-serif);
  font-size: 13px;
  color: var(--text);
}

.recent-path {
  font-size: 11px;
  color: var(--text-3);
  max-width: 240px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-empty {
  font-size: 12px;
  color: var(--text-3);
  text-align: center;
  padding: 20px 0;
}
</style>
