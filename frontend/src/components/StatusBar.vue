<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentsStore } from '../stores/documents';
import { useUiStore } from '../stores/ui';
import { exportApi } from '../api';
import { i18n } from '../i18n/zh-CN';

const docsStore = useDocumentsStore();
const uiStore = useUiStore();

function handleRevealExport() {
  if (uiStore.exportedPath) {
    exportApi.revealExportFile(uiStore.exportedPath);
  }
}

const statLabel = computed(() => {
  const s = docsStore.stats;
  switch (uiStore.statusStatMode) {
    case 'words':
      return i18n.status.words.replace('{n}', s.words.toLocaleString());
    case 'chars':
      return i18n.status.chars.replace('{n}', s.chars.toLocaleString());
    case 'lines':
      return i18n.status.lines.replace('{n}', s.lines.toLocaleString());
    case 'readTime':
      return i18n.status.readingTime.replace('{n}', s.readTimeMinutes.toString());
  }
});

const modeLabel = computed(() => {
  if (!docsStore.activeDocument) return '';
  return docsStore.activeDocument.mode === 'live' ? i18n.status.modeLive : i18n.status.modeSource;
});

const encodingLabel = computed(() => {
  if (!docsStore.activeDocument) return 'UTF-8';
  const enc = docsStore.activeDocument.encoding.toLowerCase();
  if (enc === 'gbk') return i18n.status.gbk;
  if (enc === 'utf8bom') return i18n.status.utf8bom;
  return i18n.status.utf8;
});

const eolLabel = computed(() => {
  if (!docsStore.activeDocument) return 'CRLF';
  return docsStore.activeDocument.eol.toUpperCase();
});

function toggleMode() {
  if (docsStore.activeDocument) {
    docsStore.activeDocument.mode = docsStore.activeDocument.mode === 'live' ? 'source' : 'live';
  }
}
</script>

<template>
  <footer class="statusbar">
    <!-- Left: Stats (click to cycle) -->
    <div class="status-left">
      <span
        v-if="docsStore.activeDocument"
        class="status-clickable"
        :title="'点击切换统计方式'"
        @click="uiStore.cycleStatusStatMode"
      >
        {{ statLabel }}
      </span>
      <span v-if="uiStore.temporaryStatusMessage" class="status-flash">
        · {{ uiStore.temporaryStatusMessage }}
      </span>
      <button
        v-if="uiStore.exportedPath"
        class="status-action-btn"
        @click="handleRevealExport"
      >
        {{ i18n.app.showInExplorer }}
      </button>
    </div>

    <!-- Right: Mode & Encoding & EOL -->
    <div v-if="docsStore.activeDocument" class="status-right">
      <span
        class="status-clickable"
        :title="'切换编辑模式 (Ctrl+/)'"
        @click="toggleMode"
      >
        {{ modeLabel }}
      </span>
      <span class="status-sep">·</span>
      <span>{{ encodingLabel }}</span>
      <span class="status-sep">·</span>
      <span>{{ eolLabel }}</span>
    </div>
  </footer>
</template>

<style scoped>
.statusbar {
  height: 28px;
  background-color: var(--bg-side);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 11px;
  color: var(--text-3);
  user-select: none;
  transition: color var(--duration-claude) var(--ease-claude);
}

.statusbar:hover {
  color: var(--text-2);
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-clickable {
  cursor: pointer;
  border-radius: var(--r-xs);
  padding: 2px 4px;
  transition: background-color var(--duration-claude) var(--ease-claude);
}

.status-clickable:hover {
  background-color: var(--hover);
  color: var(--text);
}

.status-sep {
  color: var(--border-strong);
}

.status-flash {
  color: var(--accent);
  animation: fadeIn 150ms ease-out;
}

.status-action-btn {
  color: var(--accent);
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  font-size: 11px;
  padding: 0 4px;
  border-radius: var(--r-xs);
  transition: all var(--duration-claude) var(--ease-claude);
}

.status-action-btn:hover {
  background-color: var(--hover);
  color: var(--accent-hover);
}
</style>
