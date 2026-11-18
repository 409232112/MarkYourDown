// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest';
const { dialog, open, retry } = vi.hoisted(() => ({ dialog: vi.fn(), open: vi.fn(), retry: vi.fn() }));
vi.mock('../../../bindings/markyourdown/internal/services', () => ({ FileService: { OpenFileDialog: dialog, OpenFileByPath: open, OpenHtmlWithEncoding: retry }, WorkspaceService: {}, SettingsService: {}, ExportService: {}, BackupService: {} }));
import { fileApi } from '../../../src/api';
const payload = { id: 'id', path: 'C:/文档/a.html', title: 'a.html', content: '<p>文字</p>', format: 'html', encoding: 'gb18030', eol: 'lf', disk: { hash: 'h', size: 1, mtimeMs: 1 } };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('prompt', vi.fn().mockReturnValue('gb18030')); retry.mockResolvedValue(payload); });
it('retries a dialog-selected HTML file with the chosen encoding', async () => {
  dialog.mockRejectedValue(new Error('C:/文档/a.html: UNSUPPORTED_ENCODING: 无法确定编码'));
  expect((await fileApi.openFileDialog())?.content).toBe(payload.content);
  expect(retry).toHaveBeenCalledWith(payload.path, 'gb18030');
});
it('retries a known HTML path and respects cancellation', async () => {
  open.mockRejectedValue(new Error('DECODE_FAILED: 错误编码'));
  expect((await fileApi.openFile(payload.path))?.format).toBe('html');
  expect(retry).toHaveBeenCalledWith(payload.path, 'gb18030');
  vi.mocked(window.prompt).mockReturnValue(null);
  retry.mockClear();
  expect(await fileApi.openFile(payload.path)).toBeNull();
  expect(retry).not.toHaveBeenCalled();
});
