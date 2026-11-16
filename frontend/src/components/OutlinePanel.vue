<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDocumentsStore, type HeadingItem } from '../stores/documents';
import { i18n } from '../i18n/zh-CN';

const docsStore = useDocumentsStore();
const filterKeyword = ref('');
const collapsedHeadingIds = ref<Set<string>>(new Set());
const activeHeadingId = ref<string | null>(null);

const filteredHeadings = computed(() => {
  const all = docsStore.outlineHeadings;
  if (!filterKeyword.value.trim()) {
    return all;
  }
  const kw = filterKeyword.value.trim().toLowerCase();
  return all.filter((h) => h.text.toLowerCase().includes(kw));
});

function toggleCollapse(id: string, e: MouseEvent) {
  e.stopPropagation();
  if (collapsedHeadingIds.value.has(id)) {
    collapsedHeadingIds.value.delete(id);
  } else {
    collapsedHeadingIds.value.add(id);
  }
}

function handleHeadingClick(item: HeadingItem) {
  activeHeadingId.value = item.id;
  // Emit custom event or smooth scroll to heading
  const editorContent = document.querySelector('.markdown-body, .myd-content');
  if (editorContent) {
    const headings = editorContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      if (h.textContent?.trim().includes(item.text)) {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  }

  // Dispatch custom event for Milkdown / CodeMirror
  window.dispatchEvent(
    new CustomEvent('editor:navigate-heading', {
      detail: { line: item.line, text: item.text, level: item.level },
    })
  );
}
</script>

<template>
  <div class="outline-panel">
    <!-- Top Filter Input -->
    <div class="filter-box">
      <input
        v-model="filterKeyword"
        type="text"
        class="filter-input"
        :placeholder="i18n.sidebar.filterOutline"
      />
    </div>

    <!-- Headings Tree -->
    <div v-if="filteredHeadings.length > 0" class="headings-list">
      <div
        v-for="item in filteredHeadings"
        :key="item.id"
        class="heading-node"
        :class="{
          active: item.id === activeHeadingId,
          'level-h1': item.level === 1,
          'level-h2': item.level === 2,
        }"
        :style="{ paddingLeft: `${(item.level - 1) * 14 + 14}px` }"
        @click="handleHeadingClick(item)"
      >
        <span class="heading-text" :title="item.text">{{ item.text }}</span>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-outline">
      {{ i18n.sidebar.emptyOutline }}
    </div>
  </div>
</template>

<style scoped>
.outline-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.filter-box {
  padding: 4px 14px 8px 14px;
}

.filter-input {
  width: 100%;
  height: 28px;
  background-color: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text);
  padding: 0 4px;
  outline: none;
  transition: border-color var(--duration-claude) var(--ease-claude);
}

.filter-input:focus {
  border-bottom-color: var(--accent);
}

.filter-input::placeholder {
  color: var(--text-3);
}

.headings-list {
  flex: 1;
  padding: 4px 8px;
}

.heading-node {
  height: 28px;
  display: flex;
  align-items: center;
  border-radius: var(--r-sm);
  cursor: pointer;
  color: var(--text-2);
  font-size: 13px;
  transition: all var(--duration-claude) var(--ease-claude);
  position: relative;
  padding-right: 8px;
}

.heading-node.level-h1 {
  font-weight: 600;
  color: var(--text);
}

.heading-node.level-h2 {
  font-weight: 500;
}

.heading-node:hover {
  background-color: var(--hover);
  color: var(--text);
}

.heading-node.active {
  color: var(--accent);
  font-weight: 600;
}

.heading-node.active::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background-color: var(--accent);
  border-radius: 1px;
}

.heading-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.empty-outline {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: var(--text-3);
  font-size: 13px;
}
</style>
