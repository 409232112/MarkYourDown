<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentsStore } from '../stores/documents';
import { useUiStore } from '../stores/ui';
import { i18n } from '../i18n/zh-CN';

const docsStore = useDocumentsStore();
const uiStore = useUiStore();

const activeDoc = computed(() => docsStore.activeDocument);

const isVisible = computed(() => {
  if (!activeDoc.value) return false;
  return ['conflict', 'deleted', 'saveFailed'].includes(activeDoc.value.status);
});

async function handleReload() {
  if (activeDoc.value) {
    await docsStore.reloadFromDisk(activeDoc.value.id);
    uiStore.flashStatus(i18n.app.reloaded);
  }
}

function handleKeepMine() {
  if (activeDoc.value) {
    docsStore.keepMyVersion(activeDoc.value.id);
  }
}

async function handleSaveAs() {
  if (activeDoc.value) {
    await docsStore.saveAsDocument(activeDoc.value.id);
  }
}

async function handleRetrySave() {
  if (activeDoc.value) {
    await docsStore.saveDocument(activeDoc.value.id);
  }
}

function handleClose() {
  if (activeDoc.value) {
    docsStore.closeDocument(activeDoc.value.id);
  }
}
</script>

<template>
  <div v-if="isVisible" class="notice-bar">
    <div class="notice-content">
      <!-- Conflict -->
      <template v-if="activeDoc?.status === 'conflict'">
        <span class="notice-text">{{ i18n.notice.externalConflict }}</span>
        <button class="notice-btn" @click="handleReload">{{ i18n.notice.reload }}</button>
        <span class="notice-dot">·</span>
        <button class="notice-btn" @click="handleKeepMine">{{ i18n.notice.keepMine }}</button>
      </template>

      <!-- Deleted -->
      <template v-else-if="activeDoc?.status === 'deleted'">
        <span class="notice-text">{{ i18n.notice.fileDeleted }}</span>
        <button class="notice-btn" @click="handleSaveAs">{{ i18n.notice.saveAs }}</button>
        <span class="notice-dot">·</span>
        <button class="notice-btn" @click="handleClose">{{ i18n.notice.close }}</button>
      </template>

      <!-- Save Failed -->
      <template v-else-if="activeDoc?.status === 'saveFailed'">
        <span class="notice-text">
          {{ i18n.notice.saveFailedPrefix }}{{ activeDoc.saveErrorMessage || '' }}
        </span>
        <button class="notice-btn" @click="handleRetrySave">{{ i18n.notice.retry }}</button>
        <span class="notice-dot">·</span>
        <button class="notice-btn" @click="handleSaveAs">{{ i18n.notice.saveAs }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.notice-bar {
  margin: 12px 24px 0 24px;
  background-color: var(--accent-soft);
  border-radius: var(--r-md);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  animation: fadeIn 160ms var(--ease-claude);
  z-index: 10;
}

.notice-content {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--accent);
}

.notice-text {
  font-weight: 500;
}

.notice-btn {
  color: var(--accent);
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--r-xs);
  transition: all var(--duration-claude) var(--ease-claude);
}

.notice-btn:hover {
  background-color: var(--hover);
  color: var(--accent-hover);
}

.notice-dot {
  opacity: 0.6;
}
</style>
