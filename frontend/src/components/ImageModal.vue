<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

export interface ImagePreviewData {
  src: string;
  alt?: string;
  title?: string;
}

const visible = ref(false);
const imgSrc = ref('');
const imgAlt = ref('');
const imgTitle = ref('');

const scale = ref(1);
const posX = ref(0);
const posY = ref(1);
const isDragging = ref(false);
const startX = ref(0);
const startY = ref(0);

function open(data: ImagePreviewData) {
  imgSrc.value = data.src;
  imgAlt.value = data.alt || '';
  imgTitle.value = data.title || data.alt || '';
  scale.value = 1;
  posX.value = 0;
  posY.value = 0;
  visible.value = true;
}

function close() {
  visible.value = false;
  imgSrc.value = '';
}

function zoomIn() {
  scale.value = Math.min(5, Number((scale.value + 0.25).toFixed(2)));
}

function zoomOut() {
  scale.value = Math.max(0.2, Number((scale.value - 0.25).toFixed(2)));
}

function resetZoom() {
  scale.value = 1;
  posX.value = 0;
  posY.value = 0;
}

function fitToScreen() {
  scale.value = 0.85;
  posX.value = 0;
  posY.value = 0;
}

function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 0.15 : -0.15;
  const nextScale = scale.value + delta;
  scale.value = Math.max(0.2, Math.min(5, Number(nextScale.toFixed(2))));
}

function handleMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  isDragging.value = true;
  startX.value = e.clientX - posX.value;
  startY.value = e.clientY - posY.value;
}

function handleMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;
  posX.value = e.clientX - startX.value;
  posY.value = e.clientY - startY.value;
}

function handleMouseUp() {
  isDragging.value = false;
}

function handleKeyDown(e: KeyboardEvent) {
  if (!visible.value) return;
  if (e.key === 'Escape') {
    close();
  } else if (e.key === '+' || e.key === '=') {
    zoomIn();
  } else if (e.key === '-' || e.key === '_') {
    zoomOut();
  } else if (e.key === '0') {
    resetZoom();
  }
}

function onGlobalPreview(e: Event) {
  const custom = e as CustomEvent<ImagePreviewData>;
  if (custom.detail && custom.detail.src) {
    open(custom.detail);
  }
}

onMounted(() => {
  window.addEventListener('image:preview', onGlobalPreview);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('image:preview', onGlobalPreview);
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div v-if="visible" class="image-modal-backdrop" @click.self="close">
    <!-- Top Bar with Image Title/Alt and Close button -->
    <div class="image-modal-header">
      <span class="image-modal-title" :title="imgTitle">{{ imgTitle || '图片预览' }}</span>
      <button class="image-modal-close" title="关闭 (Esc)" @click="close">✕</button>
    </div>

    <!-- Main Image Canvas -->
    <div
      class="image-modal-stage"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
    >
      <img
        :src="imgSrc"
        :alt="imgAlt"
        class="previewed-img"
        :style="{
          transform: `translate(${posX}px, ${posY}px) scale(${scale})`,
          cursor: isDragging ? 'grabbing' : 'grab',
        }"
        draggable="false"
      />
    </div>

    <!-- Floating Zoom Controls at Bottom -->
    <div class="image-modal-toolbar">
      <button class="tool-btn" title="缩小 (-)" @click="zoomOut">
        <span>－</span>
      </button>
      <span class="zoom-level" title="双击重置" @dblclick="resetZoom">{{ Math.round(scale * 100) }}%</span>
      <button class="tool-btn" title="放大 (+)" @click="zoomIn">
        <span>＋</span>
      </button>
      <div class="toolbar-divider"></div>
      <button class="tool-btn" title="原始大小 1:1" @click="resetZoom">
        <span>1:1</span>
      </button>
      <button class="tool-btn" title="适应屏幕" @click="fitToScreen">
        <span>适应</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.image-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background-color: rgba(24, 23, 21, 0.88);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  user-select: none;
  animation: modalFadeIn 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.image-modal-header {
  height: 48px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #faf9f5;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.4) 0%, transparent 100%);
  pointer-events: auto;
}

.image-modal-title {
  font-family: var(--font-serif);
  font-size: 14px;
  color: #eceae3;
  max-width: 70vw;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-modal-close {
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #eceae3;
  background: rgba(255, 255, 255, 0.1);
  transition: all var(--duration-claude) var(--ease-claude);
}

.image-modal-close:hover {
  background: rgba(232, 17, 35, 0.9);
  color: #ffffff;
}

.image-modal-stage {
  flex: 1;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.previewed-img {
  max-width: 85vw;
  max-height: 80vh;
  object-fit: contain;
  border-radius: var(--r-sm);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  transition: transform 60ms ease-out;
  pointer-events: auto;
}

.image-modal-toolbar {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  height: 40px;
  padding: 0 16px;
  background-color: rgba(38, 38, 36, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--r-pill);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10000;
  pointer-events: auto;
}

.tool-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #eceae3;
  background: transparent;
  transition: background-color var(--duration-claude) var(--ease-claude);
}

.tool-btn:hover {
  background-color: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.zoom-level {
  font-size: 12px;
  font-weight: 500;
  color: #a8a59b;
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.zoom-level:hover {
  color: #ffffff;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  background-color: rgba(255, 255, 255, 0.16);
  margin: 0 4px;
}
</style>
