import { beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDocumentsStore } from '../../../src/stores/documents';

const { convert, begin, commit, abort, openFile, checkStatus, probeLocalImage } = vi.hoisted(() => ({ convert: vi.fn(), begin: vi.fn(), commit: vi.fn(), abort: vi.fn(), openFile: vi.fn(), checkStatus: vi.fn(), probeLocalImage: vi.fn() }));
vi.mock('../../../src/import/html', () => ({ convertHTMLAsync: convert }));
vi.mock('../../../src/api', () => ({ fileApi: { addRecentFile: vi.fn(), openFile, checkStatus, probeLocalImage }, backupApi: { removeBackup: vi.fn() } }));
vi.mock('../../../bindings/markyourdown/internal/services', () => ({ FileService: { BeginHtmlSave: begin, CommitHtmlSave: commit, AbortHtmlSave: abort } }));
const input = { id: 'html', path: 'C:/x/source.html', title: 'source.html', content: '<p>Hi</p>', encoding: 'utf8', eol: 'lf' as const, hash: 'x', size: 9, mtimeMs: 1, format: 'html' as const };
const result = { status: 'complete', requestId: 'html-1', markdown: 'Hi\n', references: [], issues: [], summary: { converterVersion: 'html-v1', ruleSetVersion: '1', ruleSetFingerprint: 'x', meaningfulTextChars: 2, retainedImageCount: 0, degradedBlockCount: 0, omittedContentBlockCount: 0 } };
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); convert.mockResolvedValue(result); probeLocalImage.mockResolvedValue('unknown'); });
it('opens HTML as a read-only snapshot and rejects content updates', async () => {
  const store = useDocumentsStore();
  store.openDocument(input);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('complete'));
  store.updateContent('html', 'changed');
  expect(store.activeDocument?.content).toBe('Hi\n');
  expect(store.activeDocument?.path).toBeNull();
  expect(store.activeDocument?.status).toBe('clean');
  expect(store.checkDuplicate('c:\\x\\source.html')).toBe('html');
});
it('keeps preview read-only on failure and unlocks it only after successful commit', async () => {
  const store = useDocumentsStore(); store.openDocument(input);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('complete'));
  begin.mockResolvedValue({ status: 'ready', ticket: 't', targetPath: 'C:/x/result.md', rewrites: [] });
  commit.mockResolvedValueOnce({ status: 'failed', message: 'disk full' });
  abort.mockResolvedValue({ status: 'aborted' });
  expect(await store.saveAsDocument('html')).toBe(false);
  expect(store.activeDocument?.htmlImport).toBeTruthy();
  expect(abort).toHaveBeenCalledWith({ ticket: 't' });
  commit.mockResolvedValueOnce({ status: 'saved', path: 'C:/x/result.md', disk: { hash: 'h', size: 3, mtimeMs: 1 } });
  expect(await store.saveAsDocument('html')).toBe(true);
  expect(store.activeDocument?.htmlImport).toBeUndefined();
  store.updateContent('html', 'editable');
  expect(store.activeDocument?.status).toBe('dirty');
});

it('keeps the previous snapshot when reloading cannot convert the new source', async () => {
  const store = useDocumentsStore(); store.openDocument(input);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('complete'));
  openFile.mockResolvedValue({ ...input, content: '<script></script>' });
  convert.mockResolvedValueOnce({ status: 'unsupported', requestId: 'retry', reason: 'NO_STATIC_CONTENT', issues: [], summary: result.summary });
  await store.reloadHtmlImport(store.activeDocument!);
  expect(store.activeDocument?.htmlImport?.state).toBe('complete');
  expect(store.activeDocument?.content).toBe('Hi\n');
});
it('aborts save when target is already open', async () => {
  const store = useDocumentsStore(); store.openDocument(input);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('complete'));
  store.openDocument({ ...input, id: 'target', path: 'C:/x/result.md', title: 'result.md', format: 'markdown' });
  begin.mockResolvedValue({ status: 'ready', ticket: 't', targetPath: 'C:/x/result.md', rewrites: [] });
  abort.mockResolvedValue({ status: 'aborted' });
  expect(await store.saveAsDocument('html')).toBe(false);
  expect(commit).not.toHaveBeenCalled();
  expect(abort).toHaveBeenCalledWith({ ticket: 't' });
});

it('tracks source fingerprint without treating timestamp-only changes as modifications', async () => {
  const store = useDocumentsStore(); store.openDocument(input);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('complete'));
  checkStatus.mockResolvedValueOnce({status:'clean', disk:{hash:'x',size:9,mtimeMs:2}});
  await store.handleExternalFileEvent(input.path);
  expect(checkStatus).toHaveBeenCalledWith('html', input.path, 'x', 1, 9);
  expect(store.activeDocument?.htmlImport?.sourceState).toBe('unchanged');
  checkStatus.mockResolvedValueOnce({status:'conflict'});
  await store.handleExternalFileEvent(input.path);
  expect(checkStatus).toHaveBeenLastCalledWith('html', input.path, 'x', 2, 9);
  expect(store.activeDocument?.htmlImport?.sourceState).toBe('changed');
});
it('cancels a reload while preserving its previous converted snapshot', async () => {
  const store = useDocumentsStore(); store.openDocument(input);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('complete'));
  openFile.mockResolvedValueOnce({ ...input, content:'<p>new</p>' });
  convert.mockImplementationOnce((_input, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const pending = store.reloadHtmlImport(store.activeDocument!);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('loading'));
  store.cancelImport(store.activeDocument!);
  await pending;
  expect(store.activeDocument?.htmlImport?.state).toBe('complete');
  expect(store.activeDocument?.content).toBe('Hi\n');
});

it('marks definitively missing local images degraded while preserving their references', async () => {
  convert.mockResolvedValueOnce({ ...result, markdown:'![x](file:///C:/x/missing.png)\n', references:[{ id:'r', kind:'image', original:'missing.png', resolved:'file:///C:/x/missing.png', state:'available' }] });
  probeLocalImage.mockResolvedValueOnce('missing');
  const store = useDocumentsStore(); store.openDocument(input);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('degraded'));
  const converted = store.activeDocument!.htmlImport!.result!;
  if (converted.status !== 'degraded') throw new Error('expected degraded');
  expect(converted.markdown).toContain('file:///C:/x/missing.png');
  expect(converted.references[0].state).toBe('missing');
  expect(converted.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'IMAGE_MISSING', impact:'resource'})]));
});
it('does not claim denied or unknown image paths are missing', async () => {
  convert.mockResolvedValueOnce({ ...result, references:[{ id:'r', kind:'image', original:'../secret.png', resolved:'file:///C:/secret.png', state:'available' }] });
  probeLocalImage.mockResolvedValueOnce('unknown');
  const store = useDocumentsStore(); store.openDocument(input);
  await vi.waitFor(() => expect(store.activeDocument?.htmlImport?.state).toBe('complete'));
  expect(store.activeDocument?.htmlImport?.result).toMatchObject({ status:'complete', issues:[] });
});
it('does not apply a late missing-image result after the import is cancelled', async () => {
  convert.mockResolvedValueOnce({ ...result, references:[{ id:'r', kind:'image', original:'x.png', resolved:'file:///C:/x/x.png', state:'available' }] });
  let resolve!: (status:'missing') => void;
  probeLocalImage.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const store = useDocumentsStore(); store.openDocument(input);
  await vi.waitFor(() => expect(probeLocalImage).toHaveBeenCalled());
  store.cancelImport(store.activeDocument!);
  resolve('missing');
  await vi.waitFor(() => expect(store.documents).toHaveLength(0));
});
