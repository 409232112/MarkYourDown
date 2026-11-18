<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useUiStore } from '../stores/ui';
import { useDocumentsStore } from '../stores/documents';
import { i18n } from '../i18n/zh-CN';

const uiStore = useUiStore();
const docsStore = useDocumentsStore();

const query = ref('');
const replaceQuery = ref('');
const matchCase = ref(false);
const currentIndex = ref(0);
const totalMatches = ref(0);

const statusText = computed(() => {
  if (!query.value) return '';
  if (totalMatches.value === 0) return i18n.find.noMatches;
  return i18n.find.matchStatus
    .replace('{current}', (currentIndex.value + 1).toString())
    .replace('{total}', totalMatches.value.toString());
});

function handleFindNext() {
  if (!query.value) return;
  window.dispatchEvent(
    new CustomEvent('editor:find-next', {
      detail: { query: query.value, matchCase: matchCase.value },
    })
  );
}

function handleFindPrev() {
  if (!query.value) return;
  window.dispatchEvent(
    new CustomEvent('editor:find-prev', {
      detail: { query: query.value, matchCase: matchCase.value },
    })
  );
}

function handleReplace() {
  if (!query.value) return;
  window.dispatchEvent(
    new CustomEvent('editor:replace', {
      detail: { query: query.value, replacement: replaceQuery.value, matchCase: matchCase.value },
    })
  );
}

function handleReplaceAll() {
  if (!query.value) return;
  window.dispatchEvent(
    new CustomEvent('editor:replace-all', {
      detail: { query: query.value, replacement: replaceQuery.value, matchCase: matchCase.value },
    })
  );
}

function handleClose() {
  uiStore.closeFind();
}

function handleMatchStatus(e: Event) {
  const custom = e as CustomEvent<{ current: number; total: number }>;
  if (custom.detail) {
    currentIndex.value = custom.detail.current;
    totalMatches.value = custom.detail.total;
  }
}

watch(query, (val) => {
  if (!val) {
    currentIndex.value = 0;
    totalMatches.value = 0;
  }
  window.dispatchEvent(
    new CustomEvent('editor:find-query', {
      detail: { query: val, matchCase: matchCase.value },
    })
  );
});

onMounted(() => {
  window.addEventListener('editor:match-status', handleMatchStatus);
});

onUnmounted(() => {
  window.removeEventListener('editor:match-status', handleMatchStatus);
});
</script>

<template>
  <div v-if="uiStore.findBarVisible" class="find-bar">
    <div class="find-row">
      <input
        v-model="query"
        autofocus
        type="text"
        class="find-input"
        :placeholder="i18n.find.findPlaceholder"
        @keydown.enter.exact="handleFindNext"
        @keydown.shift.enter="handleFindPrev"
        @keydown.escape="handleClose"
      />
      <span class="match-count">{{ statusText }}</span>

      <button class="find-btn" :title="i18n.find.prev" @click="handleFindPrev">↑</button>
      <button class="find-btn" :title="i18n.find.next" @click="handleFindNext">↓</button>
      <button class="find-btn close-btn" :title="i18n.find.close" @click="handleClose">×</button>
    </div>

    <!-- Replace row if mode is replace -->
    <div v-if="uiStore.findBarMode === 'replace' && !docsStore.activeDocument?.htmlImport" class="replace-row">
      <input
        v-model="replaceQuery"
        type="text"
        class="find-input"
        :placeholder="i18n.find.replacePlaceholder"
        @keydown.enter="handleReplace"
        @keydown.escape="handleClose"
      />
      <button class="btn-text" @click="handleReplace">{{ i18n.find.replace }}</button>
      <button class="btn-text" @click="handleReplaceAll">{{ i18n.find.replaceAll }}</button>
    </div>
  </div>
</template>

<style scoped>
.find-bar {
  position: absolute;
  top: 12px;
  right: 24px;
  background-color: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 100;
  animation: fadeIn 120ms ease-out;
}

.find-row,
.replace-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.find-input {
  width: 180px;
  height: 26px;
  background-color: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 0 8px;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text);
  outline: none;
}

.find-input:focus {
  border-color: var(--accent);
}

.match-count {
  font-size: 11px;
  color: var(--text-3);
  min-width: 50px;
}

.find-btn {
  width: 24px;
  height: 24px;
  border-radius: var(--r-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-2);
  background: transparent;
}

.find-btn:hover {
  background-color: var(--hover);
  color: var(--text);
}

.close-btn {
  font-size: 14px;
}
</style>
