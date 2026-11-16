import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { settingsApi } from '../api';

export type ThemeType = 'warm' | 'night' | 'plain' | 'system';
export type FontType = 'serif' | 'sans-serif';
export type NetworkImagePolicy = 'auto' | 'click' | 'none';

export interface AppSettings {
  // Appearance
  theme: ThemeType;
  contentFont: FontType;
  fontSize: number; // 14 ~ 24, default 17
  lineHeight: number; // 1.5 ~ 2.2, default 1.8
  contentWidth: number; // 600 ~ 1800 px, or 0 for full width (100%), default 1000

  // General
  startupAction: 'restore' | 'blank' | 'welcome';
  autoSave: boolean;
  autoSaveInterval: number; // seconds, default 3
  autoSaveOnBlur: boolean;
  defaultEol: 'crlf' | 'lf';
  defaultEncoding: 'utf8' | 'utf8bom' | 'gbk';

  // Editor
  softWrap: boolean;
  autoCloseBrackets: boolean;
  pasteAsMarkdown: boolean;
  imageDir: 'sub' | 'docAssets';
  codeLineNumbers: boolean;
  codeWrap: boolean;
  codeStripPrompt: boolean;
  networkImagePolicy: NetworkImagePolicy;

  // Export
  htmlEmbedImages: boolean;
  htmlIncludeToc: boolean;
}

const defaultSettings: AppSettings = {
  theme: 'warm',
  contentFont: 'serif',
  fontSize: 17,
  lineHeight: 1.8,
  contentWidth: 1000,

  startupAction: 'restore',
  autoSave: true,
  autoSaveInterval: 3,
  autoSaveOnBlur: true,
  defaultEol: 'crlf',
  defaultEncoding: 'utf8',

  softWrap: true,
  autoCloseBrackets: true,
  pasteAsMarkdown: true,
  imageDir: 'sub',
  codeLineNumbers: false,
  codeWrap: false,
  codeStripPrompt: true,
  networkImagePolicy: 'auto',

  htmlEmbedImages: true,
  htmlIncludeToc: true,
};

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...defaultSettings });

  function applyToDom() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    let activeTheme = settings.value.theme;
    if (activeTheme === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      activeTheme = prefersDark ? 'night' : 'warm';
    }
    document.documentElement.setAttribute('data-theme', activeTheme);

    const rootStyle = document.documentElement.style;
    if (settings.value.contentWidth <= 0) {
      rootStyle.setProperty('--content-width', '100%');
    } else {
      rootStyle.setProperty('--content-width', `${settings.value.contentWidth}px`);
    }
    rootStyle.setProperty('--content-font-size', `${settings.value.fontSize}px`);
    rootStyle.setProperty('--content-line-height', `${settings.value.lineHeight}`);
    rootStyle.setProperty(
      '--content-font-family',
      settings.value.contentFont === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)'
    );
  }

  async function load() {
    const loaded = await settingsApi.loadSettings();
    if (loaded) {
      settings.value = { ...defaultSettings, ...loaded };
    }
    applyToDom();
  }

  async function save() {
    applyToDom();
    await settingsApi.saveSettings(settings.value);
  }

  function setTheme(t: ThemeType) {
    settings.value.theme = t;
    save();
  }

  function setFontSize(size: number) {
    settings.value.fontSize = Math.max(12, Math.min(36, size));
    save();
  }

  function setContentWidth(width: number) {
    settings.value.contentWidth = width;
    save();
  }

  function toggleFullWidth() {
    if (settings.value.contentWidth <= 0) {
      settings.value.contentWidth = 1000;
    } else {
      settings.value.contentWidth = 0; // 0 indicates 100% full width
    }
    save();
  }

  watch(
    () => [
      settings.value.theme,
      settings.value.contentFont,
      settings.value.fontSize,
      settings.value.lineHeight,
      settings.value.contentWidth,
    ],
    () => {
      applyToDom();
    }
  );

  return {
    settings,
    load,
    save,
    setTheme,
    setFontSize,
    setContentWidth,
    toggleFullWidth,
    applyToDom,
  };
});
