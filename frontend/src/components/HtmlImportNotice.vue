<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentsStore } from '../stores/documents';

const docs = useDocumentsStore();
const doc = computed(() => docs.activeDocument);
const meta = computed(() => doc.value?.htmlImport);
const message = computed(() => {
  const preview = meta.value;
  if (!preview) return '';
  if (preview.state === 'loading') return '正在转换 HTML…';
  if (preview.state === 'unsupported') return '此 HTML 没有可转换的静态内容。';
  if (preview.result?.status === 'failed') return `HTML 转换失败：${preview.result.error.message}`;
  if (preview.saving) return '正在另存为 Markdown…';
  return preview.state === 'degraded' ? '部分 HTML 内容无法完整转换 · 只读预览' : 'HTML 转换预览 · 只读';
});
</script>

<template>
  <section v-if="meta && doc" class="html-notice">
    <span role="status">{{ message }}</span>
    <button v-if="meta.state === 'loading'" @click="docs.cancelImport(doc)">取消</button>
    <button v-if="meta.state === 'failed' && meta.result?.status === 'failed' && meta.result.error.retryable" @click="docs.convertImport(doc)">重试</button>
    <template v-if="meta.sourceState !== 'unchanged' && meta.state !== 'loading'">
      <span>{{ meta.sourceState === 'deleted' ? '源文件已删除' : meta.sourceState === 'changed' ? '源文件已更改' : '无法确认源文件状态' }}</span>
      <button v-if="meta.sourceState !== 'deleted'" :disabled="meta.saving" @click="docs.reloadHtmlImport(doc)">重新转换</button>
    </template>
  </section>
</template>

<style scoped>
.html-notice { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 6px 16px; background: var(--bg-side); border-bottom: 1px solid var(--border); color: var(--text); font-size: 13px; }
button { padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--text); cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
</style>
