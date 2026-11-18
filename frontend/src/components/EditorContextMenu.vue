<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  x: number;
  y: number;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', data: { action: string; payload?: any }): void;
}>();

const activeSubmenu = ref<string | null>(null);
const menuRef = ref<HTMLElement | null>(null);

// Screen boundary adjustment
const adjustedPos = computed(() => {
  const menuWidth = 240;
  const menuHeight = 360;
  let posX = props.x;
  let posY = props.y;

  if (posX + menuWidth > window.innerWidth) {
    posX = Math.max(10, window.innerWidth - menuWidth - 10);
  }
  if (posY + menuHeight > window.innerHeight) {
    posY = Math.max(10, window.innerHeight - menuHeight - 10);
  }
  return { x: posX, y: posY };
});

function handleAction(action: string, payload?: any) {
  if (props.readOnly && !['copy', 'copy-plain-text', 'copy-markdown', 'copy-html', 'select-all'].includes(action)) return;
  emit('action', { action, payload });
  emit('close');
}

function handleGlobalClick(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close');
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('mousedown', handleGlobalClick);
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('mousedown', handleGlobalClick);
  window.removeEventListener('keydown', handleGlobalKeydown);
});
</script>

<template>
  <div
    ref="menuRef"
    class="editor-context-menu"
    :style="{ top: `${adjustedPos.y}px`, left: `${adjustedPos.x}px` }"
    @contextmenu.prevent
  >
    <!-- Top Quick Action Icons: Cut, Copy, Paste, Delete -->
    <div class="quick-icons-row">
      <button class="icon-btn" :disabled="readOnly" title="剪切 (Ctrl+X)" @click="handleAction('cut')">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="5" cy="5" r="2.2" />
          <circle cx="5" cy="11" r="2.2" />
          <path d="M6.5 6L13 12.5M6.5 10L13 3.5" />
        </svg>
      </button>
      <button class="icon-btn" title="复制 (Ctrl+C)" @click="handleAction('copy')">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="5" y="5" width="8" height="8" rx="1.5" />
          <path d="M3 11V3.5A.5.5 0 0 1 3.5 3H11" />
        </svg>
      </button>
      <button class="icon-btn" :disabled="readOnly" title="粘贴 (Ctrl+V)" @click="handleAction('paste')">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="10" height="10" rx="1.5" />
          <path d="M6 4V2.5A.5.5 0 0 1 6.5 2h3a.5.5 0 0 1 .5.5V4" />
        </svg>
      </button>
      <button class="icon-btn" :disabled="readOnly" title="删除" @click="handleAction('delete')">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 4h10M6 4V2.5h4V4M4.5 4v9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4" />
        </svg>
      </button>
    </div>

    <!-- 复制/粘贴为 -->
    <div
      class="menu-item has-submenu"
      @mouseenter="activeSubmenu = 'copy-as'"
      @mouseleave="activeSubmenu = null"
    >
      <span>复制 / 粘贴为...</span>
      <span class="arrow">›</span>

      <div v-if="activeSubmenu === 'copy-as'" class="submenu">
        <div class="menu-item" @click="handleAction('copy-plain-text')">纯文本</div>
        <div class="menu-item" @click="handleAction('copy-markdown')">Markdown 源码</div>
        <div class="menu-item" @click="handleAction('copy-html')">HTML 代码</div>
      </div>
    </div>

    <!-- Inline Format Toolbar Icons (Bold, Italic, Code, Link, Quote, Bullet list, Number list, Task list) -->
    <div class="format-icons-row" :class="{ disabled: readOnly }" :title="readOnly ? '请先另存为 Markdown' : undefined">
      <button class="format-btn bold" title="加粗 (Ctrl+B)" @click="handleAction('bold')">B</button>
      <button class="format-btn italic" title="斜体 (Ctrl+I)" @click="handleAction('italic')">I</button>
      <button class="format-btn code" title="代码 (Ctrl+Shift+`)" @click="handleAction('inlineCode')">&lt;/&gt;</button>
      <button class="format-btn link" title="链接 (Ctrl+K)" @click="handleAction('link')">🔗</button>
      <button class="format-btn quote" title="引用 (Ctrl+Shift+Q)" @click="handleAction('blockquote')">”</button>
      <button class="format-btn" title="无序列表" @click="handleAction('bullet-list')">⁝≡</button>
      <button class="format-btn" title="有序列表" @click="handleAction('ordered-list')">1.≡</button>
      <button class="format-btn" title="任务列表" @click="handleAction('task-list')">☑</button>
    </div>

    <div class="divider"></div>

    <!-- 段落 Submenu -->
    <div
      class="menu-item has-submenu"
      :class="{ 'readonly-disabled': readOnly }"
      :aria-disabled="readOnly"
      :title="readOnly ? '请先另存为 Markdown 后编辑' : undefined"
      @mouseenter="activeSubmenu = 'paragraph'"
      @mouseleave="activeSubmenu = null"
    >
      <span>段落</span>
      <span class="arrow">›</span>

      <div v-if="activeSubmenu === 'paragraph'" class="submenu">
        <div class="menu-item" @click="handleAction('heading', 1)">
          <span>一级标题</span>
          <span class="shortcut">Ctrl+1</span>
        </div>
        <div class="menu-item" @click="handleAction('heading', 2)">
          <span>二级标题</span>
          <span class="shortcut">Ctrl+2</span>
        </div>
        <div class="menu-item" @click="handleAction('heading', 3)">
          <span>三级标题</span>
          <span class="shortcut">Ctrl+3</span>
        </div>
        <div class="menu-item" @click="handleAction('heading', 4)">
          <span>四级标题</span>
          <span class="shortcut">Ctrl+4</span>
        </div>
        <div class="menu-item" @click="handleAction('heading', 5)">
          <span>五级标题</span>
          <span class="shortcut">Ctrl+5</span>
        </div>
        <div class="menu-item" @click="handleAction('heading', 6)">
          <span>六级标题</span>
          <span class="shortcut">Ctrl+6</span>
        </div>
        <div class="menu-item" @click="handleAction('paragraph')">
          <span>段落</span>
          <span class="shortcut">Ctrl+0</span>
        </div>
        <div class="divider"></div>
        <div class="menu-item" @click="handleAction('upgrade-heading')">
          <span>提升标题级别</span>
          <span class="shortcut">Ctrl+=</span>
        </div>
        <div class="menu-item" @click="handleAction('downgrade-heading')">
          <span>降低标题级别</span>
          <span class="shortcut">Ctrl+-</span>
        </div>
      </div>
    </div>

    <!-- 插入 Submenu -->
    <div
      class="menu-item has-submenu"
      :class="{ 'readonly-disabled': readOnly }"
      :aria-disabled="readOnly"
      :title="readOnly ? '请先另存为 Markdown 后编辑' : undefined"
      @mouseenter="activeSubmenu = 'insert'"
      @mouseleave="activeSubmenu = null"
    >
      <span>插入</span>
      <span class="arrow">›</span>

      <div v-if="activeSubmenu === 'insert'" class="submenu">
        <div class="menu-item" @click="handleAction('image')">
          <span>图像</span>
          <span class="shortcut">Ctrl+Shift+I</span>
        </div>
        <div class="menu-item" @click="handleAction('link')">
          <span>超链接</span>
          <span class="shortcut">Ctrl+K</span>
        </div>
        <div class="menu-item" @click="handleAction('hr')">
          <span>水平分割线</span>
        </div>
        <div class="menu-item" @click="handleAction('table')">
          <span>表格</span>
          <span class="shortcut">Ctrl+T</span>
        </div>
        <div class="menu-item" @click="handleAction('code')">
          <span>代码块</span>
          <span class="shortcut">Ctrl+Shift+K</span>
        </div>
        <div class="menu-item" @click="handleAction('math')">
          <span>公式块</span>
          <span class="shortcut">Ctrl+Shift+M</span>
        </div>
        <div class="divider"></div>
        <div class="menu-item" @click="handleAction('insert-paragraph-before')">
          <span>段落 (上方)</span>
        </div>
        <div class="menu-item" @click="handleAction('insert-paragraph-after')">
          <span>段落 (下方)</span>
        </div>
      </div>
    </div>

    <!-- 表格 Submenu -->
    <div
      class="menu-item has-submenu"
      :class="{ 'readonly-disabled': readOnly }"
      :aria-disabled="readOnly"
      :title="readOnly ? '请先另存为 Markdown 后编辑' : undefined"
      @mouseenter="activeSubmenu = 'table-ops'"
      @mouseleave="activeSubmenu = null"
    >
      <span>表格</span>
      <span class="arrow">›</span>

      <div v-if="activeSubmenu === 'table-ops'" class="submenu">
        <div class="menu-item" @click="handleAction('table-add-row-before')">在上方插入行</div>
        <div class="menu-item" @click="handleAction('table-add-row-after')">在下方插入行</div>
        <div class="menu-item" @click="handleAction('table-add-col-before')">在左侧插入列</div>
        <div class="menu-item" @click="handleAction('table-add-col-after')">在右侧插入列</div>
        <div class="divider"></div>
        <div class="menu-item" @click="handleAction('table-delete-row')">删除当前行</div>
        <div class="menu-item" @click="handleAction('table-delete-col')">删除当前列</div>
        <div class="menu-item" @click="handleAction('table-delete')">删除表格</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-context-menu {
  position: fixed;
  background-color: var(--surface, #FAF9F5);
  border: 1px solid var(--border, #E6E3D8);
  border-radius: var(--r-md, 8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 6px;
  min-width: 200px;
  z-index: 2100;
  user-select: none;
  font-family: var(--font-sans);
  animation: fadeIn 100ms ease-out;
}

.disabled, button:disabled, .readonly-disabled { opacity: .45; }
.disabled { pointer-events: none; }

.quick-icons-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 4px;
  background-color: var(--bg-side, #F0EEE6);
  border-radius: var(--r-sm, 6px);
  margin-bottom: 6px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--r-xs, 4px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--text-2, #6F6D66);
  cursor: pointer;
  transition: background-color 100ms, color 100ms;
}

.icon-btn:hover {
  background-color: var(--surface, #FAF9F5);
  color: var(--text, #2B2A26);
}

.format-icons-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px;
  margin: 4px 0;
  border-top: 1px solid var(--border, #E6E3D8);
  border-bottom: 1px solid var(--border, #E6E3D8);
}

.format-btn {
  width: 22px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 3px;
  font-size: 12px;
  color: var(--text-2, #6F6D66);
  cursor: pointer;
  transition: background-color 100ms;
}

.format-btn:hover {
  background-color: var(--hover, rgba(31, 30, 29, 0.05));
  color: var(--text, #2B2A26);
}

.format-btn.bold {
  font-weight: 700;
}

.format-btn.italic {
  font-style: italic;
  font-family: serif;
}

.format-btn.code {
  font-family: monospace;
  font-size: 10px;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text, #2B2A26);
  border-radius: var(--r-xs, 4px);
  cursor: pointer;
  position: relative;
  white-space: nowrap;
  transition: background-color 100ms;
}

.menu-item:hover {
  background-color: var(--hover, rgba(31, 30, 29, 0.05));
}

.arrow {
  color: var(--text-3, #9C9A92);
  font-size: 14px;
  margin-left: 12px;
}

.shortcut {
  font-size: 11px;
  color: var(--text-3, #9C9A92);
  margin-left: 16px;
}

.divider {
  height: 1px;
  background-color: var(--border, #E6E3D8);
  margin: 4px 0;
}

.submenu {
  position: absolute;
  top: -4px;
  left: 100%;
  margin-left: 4px;
  background-color: var(--surface, #FAF9F5);
  border: 1px solid var(--border, #E6E3D8);
  border-radius: var(--r-md, 8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 6px;
  min-width: 170px;
  z-index: 2200;
  animation: fadeIn 80ms ease-out;
}
</style>
