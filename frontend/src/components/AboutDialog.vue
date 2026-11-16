<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useUiStore } from '../stores/ui';

const uiStore = useUiStore();

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.aboutDialogOpen) {
    uiStore.closeAbout();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div v-if="uiStore.aboutDialogOpen" class="dialog-backdrop" @click.self="uiStore.closeAbout()">
    <div class="about-card dialog-card">
      <button class="close-x-btn" title="关闭" @click="uiStore.closeAbout()">×</button>

      <!-- App Logo (identical to exe icon) -->
      <div class="logo-wrapper">
        <img class="about-logo" src="/wails.png" alt="MarkYourDown" />
      </div>

      <!-- Title & Version -->
      <h2 class="app-title">MarkYourDown</h2>
      <div class="version-tag">Version 3.0.0</div>

      <!-- Golden Slogan -->
      <div class="golden-slogan">
        MarkYourDown, Your Markdown, Your Mind.
      </div>

      <p class="app-desc">轻量、温暖、沉浸的即时渲染 Markdown 编辑器</p>

      <!-- Copyright -->
      <div class="copyright-text">
        © 2026 MarkYourDown Team. All rights reserved.
      </div>

      <div class="actions-row">
        <button class="btn-primary btn-pill" @click="uiStore.closeAbout()">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-card {
  width: 420px;
  padding: 36px 32px 28px 32px;
  background-color: var(--surface);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  animation: fadeIn 140ms ease-out;
}

.close-x-btn {
  position: absolute;
  top: 14px;
  right: 16px;
  background: transparent;
  border: none;
  font-size: 20px;
  line-height: 1;
  color: var(--text-3);
  cursor: pointer;
  border-radius: var(--r-sm);
  padding: 4px 8px;
  transition: all var(--duration-claude) var(--ease-claude);
}

.close-x-btn:hover {
  background-color: var(--hover);
  color: var(--text);
}

.logo-wrapper {
  margin-bottom: 16px;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.08));
}

.about-logo {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  object-fit: contain;
  display: block;
}

.app-title {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 4px 0;
  letter-spacing: -0.01em;
}

.version-tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 12px;
  background-color: var(--bg-side);
  color: var(--text-3);
  margin-bottom: 16px;
  border: 1px solid var(--border);
  font-family: var(--font-sans);
}

.golden-slogan {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 15px;
  font-weight: 500;
  color: var(--accent);
  margin: 0 0 10px 0;
  text-align: center;
  letter-spacing: 0.01em;
}

.app-desc {
  font-size: 13px;
  color: var(--text-2);
  margin: 0 0 24px 0;
  text-align: center;
}

.copyright-text {
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 22px;
}

.actions-row {
  width: 100%;
  display: flex;
  justify-content: center;
}

.actions-row .btn-primary {
  min-width: 110px;
  padding: 8px 28px;
}
</style>
