<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const menuRef = ref<HTMLElement | null>(null);

function handleWindowClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close');
  }
}

function handleWindowKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick);
  window.addEventListener('contextmenu', handleWindowClick);
  window.addEventListener('keydown', handleWindowKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('click', handleWindowClick);
  window.removeEventListener('contextmenu', handleWindowClick);
  window.removeEventListener('keydown', handleWindowKeyDown);
});
</script>

<template>
  <div
    ref="menuRef"
    class="context-menu"
    :style="{ top: `${props.y}px`, left: `${props.x}px` }"
  >
    <slot></slot>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  background-color: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  min-width: 170px;
  z-index: 2000;
  animation: fadeIn 120ms ease-out;
}
</style>
