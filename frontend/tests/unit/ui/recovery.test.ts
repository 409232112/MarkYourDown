import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDocumentsStore } from '../../../src/stores/documents';
vi.mock('../../../src/api', () => ({ fileApi: { addRecentFile: vi.fn() }, backupApi: { removeBackup: vi.fn() } }));
beforeEach(() => setActivePinia(createPinia()));
const disk = { id: 'disk', path: 'C:/test.md', title: 'test.md', content: 'disk', encoding: 'utf8', eol: 'lf' as const, hash: 'hash', size: 4, mtimeMs: 1 };
it('restores draft over an already opened clean disk tab', () => {
  const store = useDocumentsStore();
  store.openDocument(disk);
  store.restoreDraft({ ...disk, id: 'draft', content: 'unsaved' });
  expect(store.documents).toHaveLength(1);
  expect(store.activeDocument?.content).toBe('unsaved');
  expect(store.activeDocument?.status).toBe('dirty');
});
it('preserves edits made while recovery prompt was open', () => {
  const store = useDocumentsStore();
  store.openDocument(disk);
  store.activeDocument!.content = 'new edits';
  store.activeDocument!.status = 'dirty';
  store.restoreDraft({ ...disk, id: 'draft', content: 'old draft' });
  expect(store.documents).toHaveLength(2);
  expect(store.documents.find(d => d.id === 'disk')?.content).toBe('new edits');
  expect(store.activeDocument?.content).toBe('old draft');
  expect(store.activeDocument?.path).toBe('');
});
