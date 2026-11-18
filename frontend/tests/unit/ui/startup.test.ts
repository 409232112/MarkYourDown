// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App as VueApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useDocumentsStore } from '../../../src/stores/documents';
import { useUiStore } from '../../../src/stores/ui';
import App from '../../../src/App.vue';
const api = vi.hoisted(() => ({
  settingsApi: { loadSettings: vi.fn(), saveSettings: vi.fn() },
  backupApi: { listBackups: vi.fn(), loadSession: vi.fn(), authorizeRestoredDraft: vi.fn(), removeBackup: vi.fn() },
  fileApi: { openFile: vi.fn(), addRecentFile: vi.fn() },
  exportApi: {}, workspaceApi: {},
}));
vi.mock('../../../src/api', () => api);
vi.mock('@wailsio/runtime', () => ({ Events: { On: () => () => {} } }));
vi.mock('../../../src/components/TitleBar.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/Sidebar.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/StatusBar.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/NoticeBar.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/FindBar.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/Welcome.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/EditorHost.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/SettingsDialog.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/Dialog.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/ImageModal.vue', () => ({ default: { render: () => null } }));
vi.mock('../../../src/components/AboutDialog.vue', () => ({ default: { render: () => null } }));
let app: VueApp;
let container: HTMLElement;
const flush = async () => { for (let i = 0; i < 10; i++) await nextTick(); };
beforeEach(() => {
  vi.resetAllMocks();
  api.backupApi.listBackups.mockResolvedValue([]);
  api.backupApi.loadSession.mockResolvedValue({ tabs: [{ path: 'C:/test.md' }] });
  const pinia = createPinia();
  setActivePinia(pinia);
  container = document.createElement('div');
  document.body.appendChild(container);
  app = createApp(App).use(pinia);
});
afterEach(() => { app.unmount(); container.remove(); });
it.each(['blank', 'welcome'])('waits for persisted %s settings before deciding startup', async (startupAction) => {
  let resolve!: (value: unknown) => void;
  api.settingsApi.loadSettings.mockReturnValue(new Promise(r => { resolve = r; }));
  app.mount(container);
  await flush();
  expect(api.backupApi.loadSession).not.toHaveBeenCalled();
  resolve({ startupAction });
  await flush();
  expect(api.backupApi.loadSession).not.toHaveBeenCalled();
  expect(useDocumentsStore().documents).toHaveLength(startupAction === 'blank' ? 1 : 0);
});
it('waits for draft recovery before opening session paths', async () => {
  api.settingsApi.loadSettings.mockResolvedValue({ startupAction: 'restore' });
  api.backupApi.listBackups.mockResolvedValue([{ id: 'draft', path: 'C:/test.md', content: 'unsaved' }]);
  api.backupApi.authorizeRestoredDraft.mockResolvedValue(true);
  app.mount(container);
  await flush();
  expect(api.backupApi.loadSession).not.toHaveBeenCalled();
  await useUiStore().confirmDialog.onConfirm();
  await flush();
  expect(api.backupApi.loadSession).toHaveBeenCalledOnce();
  expect(api.fileApi.openFile).not.toHaveBeenCalled();
  expect(useDocumentsStore().activeDocument?.content).toBe('unsaved');
  expect(useDocumentsStore().activeDocument?.status).toBe('dirty');
});

it('restores HTML source, mode, scroll and selected tab from a session', async () => {
  api.settingsApi.loadSettings.mockResolvedValue({ startupAction: 'restore' });
  api.backupApi.loadSession.mockResolvedValue({ activeTabId:'old-html', tabs:[
    { id:'old-html', path:'', sourcePath:'C:/test.html', kind:'html-preview', mode:'source', scrollTop:45 },
    { id:'old-md', path:'C:/test.md', mode:'live' },
  ] });
  api.fileApi.openFile.mockImplementation(async (path:string) => ({ id:path, path, title:path.split('/').pop(), format:path.endsWith('.html') ? 'html' : 'markdown', content:path.endsWith('.html') ? '<p>hello</p>' : '# hello', encoding:'utf8', eol:'lf', mtimeMs:1, size:1, hash:'h' }));
  app.mount(container);
  await vi.waitFor(() => expect(useDocumentsStore().documents).toHaveLength(2));
  const doc = useDocumentsStore().activeDocument;
  expect(doc?.htmlImport?.sourcePath).toBe('C:/test.html');
  expect(doc?.mode).toBe('source');
  expect(doc?.scrollTop).toBe(45);
});
