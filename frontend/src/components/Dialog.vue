<script setup lang="ts">
import { useUiStore } from '../stores/ui';
import { i18n } from '../i18n/zh-CN';

const uiStore = useUiStore();

function handleConfirm() {
  uiStore.confirmDialog.onConfirm();
}

function handleCancel() {
  if (uiStore.confirmDialog.onCancel) {
    uiStore.confirmDialog.onCancel();
  } else {
    uiStore.closeConfirm();
  }
}

function handleSecondary() {
  if (uiStore.confirmDialog.onSecondary) {
    uiStore.confirmDialog.onSecondary();
  }
}
</script>

<template>
  <div v-if="uiStore.confirmDialog.visible" class="dialog-backdrop" @click.self="handleCancel">
    <div class="confirm-card dialog-card">
      <h3 class="dialog-title">{{ uiStore.confirmDialog.title }}</h3>
      <p class="dialog-message">{{ uiStore.confirmDialog.message }}</p>

      <div class="dialog-actions">
        <button
          v-if="uiStore.confirmDialog.secondaryText"
          class="btn-secondary btn-pill"
          @click="handleSecondary"
        >
          {{ uiStore.confirmDialog.secondaryText }}
        </button>
        <button class="btn-secondary btn-pill" @click="handleCancel">
          {{ uiStore.confirmDialog.cancelText || i18n.dialog.cancel }}
        </button>
        <button class="btn-primary btn-pill" @click="handleConfirm">
          {{ uiStore.confirmDialog.confirmText || i18n.dialog.confirm }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-card {
  width: 420px;
  padding: 24px;
  background-color: var(--surface);
}

.dialog-title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 12px;
}

.dialog-message {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-2);
  margin-bottom: 28px;
}

.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}
</style>
