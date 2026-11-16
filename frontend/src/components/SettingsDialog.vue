<script setup lang="ts">
import { ref } from 'vue';
import { useSettingsStore, type ThemeType, type FontType, type NetworkImagePolicy } from '../stores/settings';
import { useUiStore } from '../stores/ui';
import { i18n } from '../i18n/zh-CN';

const settingsStore = useSettingsStore();
const uiStore = useUiStore();

const activeTab = ref<'general' | 'editor' | 'appearance' | 'export'>(uiStore.settingsInitialTab);

function selectTab(tab: 'general' | 'editor' | 'appearance' | 'export') {
  activeTab.value = tab;
}

function handleClose() {
  uiStore.closeSettings();
  settingsStore.save();
}

function setTheme(t: ThemeType) {
  settingsStore.settings.theme = t;
  settingsStore.applyToDom();
}

function setFont(f: FontType) {
  settingsStore.settings.contentFont = f;
  settingsStore.applyToDom();
}

function setNetworkImagePolicy(p: NetworkImagePolicy) {
  settingsStore.settings.networkImagePolicy = p;
}
</script>

<template>
  <div v-if="uiStore.settingsDialogOpen" class="dialog-backdrop" @click.self="handleClose">
    <div class="settings-dialog dialog-card">
      <!-- Left: Category List -->
      <nav class="settings-sidebar">
        <h2 class="settings-title">{{ i18n.settings.title }}</h2>
        <div class="tab-list">
          <div
            class="tab-item"
            :class="{ active: activeTab === 'general' }"
            @click="selectTab('general')"
          >
            {{ i18n.settings.tabGeneral }}
          </div>
          <div
            class="tab-item"
            :class="{ active: activeTab === 'editor' }"
            @click="selectTab('editor')"
          >
            {{ i18n.settings.tabEditor }}
          </div>
          <div
            class="tab-item"
            :class="{ active: activeTab === 'appearance' }"
            @click="selectTab('appearance')"
          >
            {{ i18n.settings.tabAppearance }}
          </div>
          <div
            class="tab-item"
            :class="{ active: activeTab === 'export' }"
            @click="selectTab('export')"
          >
            {{ i18n.settings.tabExport }}
          </div>
        </div>
      </nav>

      <!-- Right: Settings Content -->
      <main class="settings-main">
        <div class="settings-scroll-area">
          <!-- General -->
          <div v-show="activeTab === 'general'" class="settings-section">
            <h3 class="section-title">{{ i18n.settings.tabGeneral }}</h3>

            <div class="form-group">
              <label class="form-label">{{ i18n.settings.startup }}</label>
              <div class="segmented-control">
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.startupAction === 'restore' }"
                  @click="settingsStore.settings.startupAction = 'restore'"
                >
                  {{ i18n.settings.startupRestore }}
                </div>
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.startupAction === 'blank' }"
                  @click="settingsStore.settings.startupAction = 'blank'"
                >
                  {{ i18n.settings.startupBlank }}
                </div>
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.startupAction === 'welcome' }"
                  @click="settingsStore.settings.startupAction = 'welcome'"
                >
                  {{ i18n.settings.startupWelcome }}
                </div>
              </div>
            </div>

            <div class="form-group row">
              <div>
                <div class="form-label">{{ i18n.settings.autoSave }}</div>
                <div class="form-desc">{{ i18n.settings.autoSaveDesc }}</div>
              </div>
              <input
                v-model="settingsStore.settings.autoSave"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div v-if="settingsStore.settings.autoSave" class="form-group row">
              <label class="form-label">{{ i18n.settings.autoSaveInterval }}</label>
              <div class="slider-group">
                <input
                  v-model.number="settingsStore.settings.autoSaveInterval"
                  type="range"
                  min="1"
                  max="10"
                  class="form-range"
                />
                <span class="range-val">{{ settingsStore.settings.autoSaveInterval }}s</span>
              </div>
            </div>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.autoSaveOnBlur }}</div>
              <input
                v-model="settingsStore.settings.autoSaveOnBlur"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div class="form-group row">
              <label class="form-label">{{ i18n.settings.defaultEol }}</label>
              <div class="segmented-control">
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.defaultEol === 'crlf' }"
                  @click="settingsStore.settings.defaultEol = 'crlf'"
                >
                  CRLF
                </div>
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.defaultEol === 'lf' }"
                  @click="settingsStore.settings.defaultEol = 'lf'"
                >
                  LF
                </div>
              </div>
            </div>

            <div class="form-group row">
              <label class="form-label">{{ i18n.settings.defaultEncoding }}</label>
              <div class="segmented-control">
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.defaultEncoding === 'utf8' }"
                  @click="settingsStore.settings.defaultEncoding = 'utf8'"
                >
                  UTF-8
                </div>
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.defaultEncoding === 'gbk' }"
                  @click="settingsStore.settings.defaultEncoding = 'gbk'"
                >
                  GBK
                </div>
              </div>
            </div>
          </div>

          <!-- Editor -->
          <div v-show="activeTab === 'editor'" class="settings-section">
            <h3 class="section-title">{{ i18n.settings.tabEditor }}</h3>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.softWrap }}</div>
              <input
                v-model="settingsStore.settings.softWrap"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.autoCloseBrackets }}</div>
              <input
                v-model="settingsStore.settings.autoCloseBrackets"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.pasteAsMarkdown }}</div>
              <input
                v-model="settingsStore.settings.pasteAsMarkdown"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div class="form-group">
              <label class="form-label">{{ i18n.settings.imageDir }}</label>
              <div class="segmented-control">
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.imageDir === 'sub' }"
                  @click="settingsStore.settings.imageDir = 'sub'"
                >
                  {{ i18n.settings.imageDirSub }}
                </div>
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.imageDir === 'docAssets' }"
                  @click="settingsStore.settings.imageDir = 'docAssets'"
                >
                  {{ i18n.settings.imageDirDocAssets }}
                </div>
              </div>
            </div>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.codeLineNumbers }}</div>
              <input
                v-model="settingsStore.settings.codeLineNumbers"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.codeWrap }}</div>
              <input
                v-model="settingsStore.settings.codeWrap"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.codeStripPrompt }}</div>
              <input
                v-model="settingsStore.settings.codeStripPrompt"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div class="form-group">
              <label class="form-label">{{ i18n.settings.networkImagePolicy }}</label>
              <div class="segmented-control">
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.networkImagePolicy === 'auto' }"
                  @click="setNetworkImagePolicy('auto')"
                >
                  {{ i18n.settings.networkImageAuto }}
                </div>
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.networkImagePolicy === 'click' }"
                  @click="setNetworkImagePolicy('click')"
                >
                  {{ i18n.settings.networkImageClick }}
                </div>
                <div
                  class="segmented-item"
                  :class="{ active: settingsStore.settings.networkImagePolicy === 'none' }"
                  @click="setNetworkImagePolicy('none')"
                >
                  {{ i18n.settings.networkImageNone }}
                </div>
              </div>
              <div class="form-tip">{{ i18n.settings.networkImageTip }}</div>
            </div>
          </div>

          <!-- Appearance -->
          <div v-show="activeTab === 'appearance'" class="settings-section">
            <h3 class="section-title">{{ i18n.settings.tabAppearance }}</h3>

            <!-- Theme Cards -->
            <div class="form-group">
              <label class="form-label">{{ i18n.settings.theme }}</label>
              <div class="theme-cards">
                <div
                  class="theme-card warm"
                  :class="{ selected: settingsStore.settings.theme === 'warm' }"
                  @click="setTheme('warm')"
                >
                  <div class="theme-preview warm-bg">
                    <span class="preview-text">Aa</span>
                  </div>
                  <span class="theme-label">{{ i18n.settings.themeWarm }}</span>
                </div>

                <div
                  class="theme-card night"
                  :class="{ selected: settingsStore.settings.theme === 'night' }"
                  @click="setTheme('night')"
                >
                  <div class="theme-preview night-bg">
                    <span class="preview-text">Aa</span>
                  </div>
                  <span class="theme-label">{{ i18n.settings.themeNight }}</span>
                </div>

                <div
                  class="theme-card plain"
                  :class="{ selected: settingsStore.settings.theme === 'plain' }"
                  @click="setTheme('plain')"
                >
                  <div class="theme-preview plain-bg">
                    <span class="preview-text">Aa</span>
                  </div>
                  <span class="theme-label">{{ i18n.settings.themePlain }}</span>
                </div>

                <div
                  class="theme-card system"
                  :class="{ selected: settingsStore.settings.theme === 'system' }"
                  @click="setTheme('system')"
                >
                  <div class="theme-preview system-bg">
                    <span class="preview-text">◐</span>
                  </div>
                  <span class="theme-label">{{ i18n.settings.themeSystem }}</span>
                </div>
              </div>
            </div>

            <!-- Content Font -->
            <div class="form-group">
              <label class="form-label">{{ i18n.settings.contentFont }}</label>
              <div class="segmented-control">
                <div
                  class="segmented-item font-serif-preview"
                  :class="{ active: settingsStore.settings.contentFont === 'serif' }"
                  @click="setFont('serif')"
                >
                  {{ i18n.settings.fontSerif }}
                </div>
                <div
                  class="segmented-item font-sans-preview"
                  :class="{ active: settingsStore.settings.contentFont === 'sans-serif' }"
                  @click="setFont('sans-serif')"
                >
                  {{ i18n.settings.fontSans }}
                </div>
              </div>
            </div>

            <!-- Font Size -->
            <div class="form-group row">
              <label class="form-label">{{ i18n.settings.fontSize }}</label>
              <div class="slider-group">
                <input
                  v-model.number="settingsStore.settings.fontSize"
                  type="range"
                  min="14"
                  max="24"
                  class="form-range"
                />
                <span class="range-val">{{ settingsStore.settings.fontSize }}px</span>
              </div>
            </div>

            <!-- Line Height -->
            <div class="form-group row">
              <label class="form-label">{{ i18n.settings.lineHeight }}</label>
              <div class="slider-group">
                <input
                  v-model.number="settingsStore.settings.lineHeight"
                  type="range"
                  min="1.5"
                  max="2.2"
                  step="0.1"
                  class="form-range"
                />
                <span class="range-val">{{ settingsStore.settings.lineHeight }}</span>
              </div>
            </div>

            <!-- Content Max Width -->
            <div class="form-group row" style="align-items: flex-start;">
              <label class="form-label" style="padding-top: 6px;">{{ i18n.settings.contentWidth }}</label>
              <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
                <div class="slider-group" style="align-items: center; gap: 12px;">
                  <input
                    :value="settingsStore.settings.contentWidth <= 0 ? 1000 : settingsStore.settings.contentWidth"
                    @input="settingsStore.setContentWidth(Number(($event.target as HTMLInputElement).value))"
                    type="range"
                    min="600"
                    max="1800"
                    step="20"
                    class="form-range"
                  />
                  <span class="range-val" style="min-width: 90px; font-weight: 500;">
                    {{ settingsStore.settings.contentWidth <= 0 ? '自适应全宽 (100%)' : `${settingsStore.settings.contentWidth}px` }}
                  </span>
                </div>
                <!-- Presets -->
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button
                    class="btn-secondary"
                    :class="{ active: settingsStore.settings.contentWidth <= 0 }"
                    style="height: 24px; padding: 0 8px; font-size: 11px;"
                    @click="settingsStore.setContentWidth(0)"
                  >
                    自适应全宽 (100%)
                  </button>
                  <button
                    class="btn-secondary"
                    :class="{ active: settingsStore.settings.contentWidth === 1400 }"
                    style="height: 24px; padding: 0 8px; font-size: 11px;"
                    @click="settingsStore.setContentWidth(1400)"
                  >
                    超宽 (1400px)
                  </button>
                  <button
                    class="btn-secondary"
                    :class="{ active: settingsStore.settings.contentWidth === 1200 }"
                    style="height: 24px; padding: 0 8px; font-size: 11px;"
                    @click="settingsStore.setContentWidth(1200)"
                  >
                    宽屏 (1200px)
                  </button>
                  <button
                    class="btn-secondary"
                    :class="{ active: settingsStore.settings.contentWidth === 1000 }"
                    style="height: 24px; padding: 0 8px; font-size: 11px;"
                    @click="settingsStore.setContentWidth(1000)"
                  >
                    标准 (1000px)
                  </button>
                  <button
                    class="btn-secondary"
                    :class="{ active: settingsStore.settings.contentWidth === 800 }"
                    style="height: 24px; padding: 0 8px; font-size: 11px;"
                    @click="settingsStore.setContentWidth(800)"
                  >
                    紧凑 (800px)
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Export -->
          <div v-show="activeTab === 'export'" class="settings-section">
            <h3 class="section-title">{{ i18n.settings.tabExport }}</h3>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.htmlEmbedImages }}</div>
              <input
                v-model="settingsStore.settings.htmlEmbedImages"
                type="checkbox"
                class="form-checkbox"
              />
            </div>

            <div class="form-group row">
              <div class="form-label">{{ i18n.settings.htmlIncludeToc }}</div>
              <input
                v-model="settingsStore.settings.htmlIncludeToc"
                type="checkbox"
                class="form-checkbox"
              />
            </div>
          </div>
        </div>

        <!-- Footer -->
        <footer class="settings-footer">
          <button class="btn-primary btn-pill" @click="handleClose">
            {{ i18n.settings.done }}
          </button>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
.settings-dialog {
  width: 760px;
  height: 560px;
  display: flex;
  background-color: var(--surface);
}

.settings-sidebar {
  width: 180px;
  background-color: var(--bg-side);
  border-right: 1px solid var(--border);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
}

.settings-title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 24px;
  padding-left: 8px;
}

.tab-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tab-item {
  height: 34px;
  padding: 0 12px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
  transition: all var(--duration-claude) var(--ease-claude);
}

.tab-item:hover {
  background-color: var(--hover);
  color: var(--text);
}

.tab-item.active {
  background-color: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
  font-weight: 500;
}

.settings-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 28px 36px;
}

.settings-section {
  animation: fadeIn 120ms ease-out;
}

.section-title {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-label {
  font-size: 13px;
  color: var(--text);
  margin-bottom: 6px;
  display: block;
}

.form-desc {
  font-size: 12px;
  color: var(--text-3);
}

.form-tip {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 6px;
}

.slider-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-range {
  width: 140px;
  accent-color: var(--accent);
}

.range-val {
  font-size: 12px;
  color: var(--text-2);
  min-width: 40px;
  text-align: right;
  font-family: var(--font-mono);
}

.form-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

/* Theme Cards */
.theme-cards {
  display: flex;
  gap: 12px;
}

.theme-card {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  transition: all var(--duration-claude) var(--ease-claude);
}

.theme-card:hover {
  border-color: var(--border-strong);
}

.theme-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.theme-preview {
  width: 100%;
  height: 48px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
}

.warm-bg {
  background-color: #faf9f5;
  color: #2b2a26;
}

.night-bg {
  background-color: #262624;
  color: #eceae3;
}

.plain-bg {
  background-color: #ffffff;
  color: #2b2a26;
}

.system-bg {
  background: linear-gradient(135deg, #faf9f5 50%, #262624 50%);
  color: #c96442;
}

.preview-text {
  font-family: var(--font-serif);
  font-size: 18px;
}

.theme-label {
  font-size: 12px;
  color: var(--text-2);
}

.font-serif-preview {
  font-family: var(--font-serif);
}

.font-sans-preview {
  font-family: var(--font-sans);
}

/* About panel */
.about-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 40px 0;
}

.brand-name {
  font-family: var(--font-serif);
  font-size: 28px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 4px;
}

.brand-ver {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 16px;
}

.brand-desc {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 24px;
}

.about-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.settings-footer {
  height: 60px;
  padding: 0 36px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
</style>
