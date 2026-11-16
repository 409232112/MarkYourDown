<script setup lang="ts">
import { ref } from 'vue';
import { useUiStore } from '../stores/ui';
import { i18n } from '../i18n/zh-CN';
import OutlinePanel from './OutlinePanel.vue';
import FilePanel from './FilePanel.vue';

const uiStore = useUiStore();
const isResizing = ref(false);

function startResize(e: MouseEvent) {
  isResizing.value = true;
  const startX = e.clientX;
  const startWidth = uiStore.sidebarWidth;

  function onMouseMove(moveEvent: MouseEvent) {
    const newWidth = Math.min(420, Math.max(220, startWidth + (moveEvent.clientX - startX)));
    uiStore.sidebarWidth = newWidth;
  }

  function onMouseUp() {
    isResizing.value = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ collapsed: !uiStore.sidebarVisible, resizing: isResizing }"
    :style="{ width: uiStore.sidebarVisible ? `${uiStore.sidebarWidth}px` : '0px' }"
  >
    <div class="sidebar-inner" :style="{ width: `${uiStore.sidebarWidth}px` }">
      <!-- Top Segment Control -->
      <div class="sidebar-header">
        <div class="segmented-control">
          <div
            class="segmented-item"
            :class="{ active: uiStore.sidebarTab === 'files' }"
            @click="uiStore.setSidebarTab('files')"
          >
            {{ i18n.sidebar.files }}
          </div>
          <div
            class="segmented-item"
            :class="{ active: uiStore.sidebarTab === 'outline' }"
            @click="uiStore.setSidebarTab('outline')"
          >
            {{ i18n.sidebar.outline }}
          </div>
        </div>
      </div>

      <!-- Panel content -->
      <div class="sidebar-content">
        <OutlinePanel v-show="uiStore.sidebarTab === 'outline'" />
        <FilePanel v-show="uiStore.sidebarTab === 'files'" />
      </div>
    </div>

    <!-- Drag resize handle -->
    <div
      v-if="uiStore.sidebarVisible"
      class="resize-handle"
      @mousedown.prevent="startResize"
    ></div>
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  background-color: var(--bg-side);
  border-right: 1px solid var(--border);
  position: relative;
  flex-shrink: 0;
  transition: width 200ms var(--ease-claude);
  overflow: hidden;
}

.sidebar.resizing {
  transition: none; /* disable transition while dragging */
}

.sidebar.collapsed {
  width: 0 !important;
  border-right: none;
}

.sidebar-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 10px 16px;
  display: flex;
  justify-content: center;
  border-bottom: 1px solid var(--border);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  transition: background-color var(--duration-claude) var(--ease-claude);
}

.resize-handle:hover {
  background-color: var(--accent);
}
</style>
