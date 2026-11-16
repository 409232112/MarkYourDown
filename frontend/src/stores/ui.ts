import { defineStore } from 'pinia';
import { ref } from 'vue';
import { i18n } from '../i18n/zh-CN';

export type SidebarTab = 'outline' | 'files';
export type StatMode = 'words' | 'chars' | 'lines' | 'readTime';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  secondaryText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  onSecondary?: () => void;
}

export const useUiStore = defineStore('ui', () => {
  const sidebarVisible = ref(true);
  const sidebarTab = ref<SidebarTab>('outline');
  const sidebarWidth = ref(272); // 220 ~ 420px

  const statusStatMode = ref<StatMode>('words');
  const temporaryStatusMessage = ref<string | null>(null);
  const exportedPath = ref<string | null>(null);
  let statusMessageTimer: any = null;

  const settingsDialogOpen = ref(false);
  const settingsInitialTab = ref<'general' | 'editor' | 'appearance' | 'export'>('general');
  const aboutDialogOpen = ref(false);
  const shortcutsHelpOpen = ref(false);

  const findBarVisible = ref(false);
  const findBarMode = ref<'find' | 'replace'>('find');

  const focusMode = ref(false); // F8
  const typewriterMode = ref(false); // F9

  // Global Dialog
  const confirmDialog = ref<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    secondaryText?: string;
    onConfirm: () => void;
    onCancel?: () => void;
    onSecondary?: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  function toggleSidebar() {
    sidebarVisible.value = !sidebarVisible.value;
  }

  function setSidebarTab(tab: SidebarTab) {
    sidebarTab.value = tab;
    if (!sidebarVisible.value) {
      sidebarVisible.value = true;
    }
  }

  function cycleStatusStatMode() {
    const modes: StatMode[] = ['words', 'chars', 'lines', 'readTime'];
    const idx = modes.indexOf(statusStatMode.value);
    statusStatMode.value = modes[(idx + 1) % modes.length];
  }

  function flashStatus(msg: string, timeout = 1500) {
    temporaryStatusMessage.value = msg;
    if (statusMessageTimer) {
      clearTimeout(statusMessageTimer);
    }
    statusMessageTimer = setTimeout(() => {
      temporaryStatusMessage.value = null;
      exportedPath.value = null;
      statusMessageTimer = null;
    }, timeout);
  }

  function flashExported(path: string) {
    exportedPath.value = path;
    flashStatus(i18n.app.exported, 4000);
  }

  function openSettings(tab: 'general' | 'editor' | 'appearance' | 'export' = 'general') {
    settingsInitialTab.value = tab;
    settingsDialogOpen.value = true;
  }

  function closeSettings() {
    settingsDialogOpen.value = false;
  }

  function openAbout() {
    aboutDialogOpen.value = true;
  }

  function closeAbout() {
    aboutDialogOpen.value = false;
  }

  function openFind(mode: 'find' | 'replace' = 'find') {
    findBarMode.value = mode;
    findBarVisible.value = true;
  }

  function closeFind() {
    findBarVisible.value = false;
  }

  function toggleFocusMode() {
    focusMode.value = !focusMode.value;
  }

  function toggleTypewriterMode() {
    typewriterMode.value = !typewriterMode.value;
  }

  function showConfirm(options: ConfirmDialogOptions) {
    confirmDialog.value = {
      visible: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText,
      cancelText: options.cancelText,
      secondaryText: options.secondaryText,
      onConfirm: () => {
        options.onConfirm();
        confirmDialog.value.visible = false;
      },
      onCancel: () => {
        options.onCancel?.();
        confirmDialog.value.visible = false;
      },
      onSecondary: () => {
        options.onSecondary?.();
        confirmDialog.value.visible = false;
      },
    };
  }

  function closeConfirm() {
    confirmDialog.value.visible = false;
  }

  return {
    sidebarVisible,
    sidebarTab,
    sidebarWidth,
    statusStatMode,
    temporaryStatusMessage,
    exportedPath,
    settingsDialogOpen,
    settingsInitialTab,
    aboutDialogOpen,
    shortcutsHelpOpen,
    findBarVisible,
    findBarMode,
    focusMode,
    typewriterMode,
    confirmDialog,
    toggleSidebar,
    setSidebarTab,
    cycleStatusStatMode,
    flashStatus,
    flashExported,
    openSettings,
    closeSettings,
    openAbout,
    closeAbout,
    openFind,
    closeFind,
    toggleFocusMode,
    toggleTypewriterMode,
    showConfirm,
    closeConfirm,
  };
});
