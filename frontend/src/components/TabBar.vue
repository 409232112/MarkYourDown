<script setup lang="ts">
import { ref } from 'vue';
import { useDocumentsStore, type DocState } from '../stores/documents';
import ContextMenu from './ContextMenu.vue';

const docsStore = useDocumentsStore();
const menu = ref<{ x: number; y: number; id: string } | null>(null);

function showMenu(doc: DocState, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  menu.value = { x: event.clientX, y: event.clientY, id: doc.id };
}

function closeTabs(otherOnly: boolean) {
  const target = menu.value?.id;
  menu.value = null;
  docsStore.requestCloseDocuments(docsStore.documents.filter(doc => !otherOnly || doc.id !== target).map(doc => doc.id));
}

function handleTabClick(doc: DocState) {
  docsStore.switchDocument(doc.id);
}

function handleTabClose(doc: DocState, event: MouseEvent) {
  event.stopPropagation();
  docsStore.requestCloseDocument(doc.id);
}

function handleTabAuxClick(doc: DocState, event: MouseEvent) {
  // Middle click close
  if (event.button === 1) {
    event.preventDefault();
    docsStore.requestCloseDocument(doc.id);
  }
}
</script>

<template>
  <div class="tab-bar">
    <div
      v-for="doc in docsStore.documents"
      :key="doc.id"
      class="tab-item"
      :class="{ active: doc.id === docsStore.activeDocumentId }"
      @click="handleTabClick(doc)"
      @auxclick="handleTabAuxClick(doc, $event)"
      @contextmenu="showMenu(doc, $event)"
    >
      <span class="tab-title">
        {{ doc.title }}
        <span v-if="doc.status !== 'clean'" class="dirty-mark">*</span>
      </span>
      <button
        class="tab-close"
        title="关闭标签"
        @click="handleTabClose(doc, $event)"
      >
        ×
      </button>
    </div>
  </div>
  <Teleport to="body">
    <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" @close="menu = null">
      <button class="tab-menu-item" @click="closeTabs(false)">关闭全部</button>
      <button class="tab-menu-item" @click="closeTabs(true)">关闭其他</button>
    </ContextMenu>
  </Teleport>
</template>

<style scoped>
.tab-menu-item { display: block; width: 100%; text-align: left; padding: 7px 12px; color: var(--text); border-radius: var(--r-sm); }
.tab-menu-item:hover { background: var(--hover); }
.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  max-width: 680px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 4px;
}

.tab-bar::-webkit-scrollbar {
  height: 2px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px 0 12px;
  border-radius: var(--r-sm);
  background-color: transparent;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-claude) var(--ease-claude);
  border: 1px solid transparent;
}

.tab-item:hover {
  background-color: var(--hover);
  color: var(--text);
}

.tab-item.active {
  background-color: var(--surface);
  color: var(--text);
  border-color: var(--border);
  box-shadow: var(--shadow-sm);
  font-weight: 500;
}

.tab-title {
  display: flex;
  align-items: center;
  font-family: var(--font-serif);
}

.dirty-mark {
  color: var(--accent);
  font-weight: bold;
  font-size: 14px;
  line-height: 1;
  margin-left: 3px;
}

.tab-close {
  width: 18px;
  height: 18px;
  border-radius: var(--r-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  color: var(--text-3);
  background: transparent;
  opacity: 0.6;
  transition: all var(--duration-claude) var(--ease-claude);
}

.tab-item:hover .tab-close,
.tab-item.active .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background-color: var(--hover);
  color: var(--text);
}
</style>
