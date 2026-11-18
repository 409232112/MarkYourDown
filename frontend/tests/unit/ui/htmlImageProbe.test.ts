import { beforeEach, expect, it, vi } from 'vitest';
const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock('../../../bindings/markyourdown/internal/services', () => ({ FileService: { GetImageToken: getToken }, WorkspaceService: {}, SettingsService: {}, ExportService: {}, BackupService: {} }));
import { fileApi } from '../../../src/api';
beforeEach(() => vi.resetAllMocks());
it('distinguishes missing images from inaccessible or unavailable images', async () => {
  getToken.mockResolvedValueOnce('/local-image/token');
  expect(await fileApi.probeLocalImage('C:/source.html', 'file:///C:/image.png')).toBe('available');
  getToken.mockRejectedValueOnce(new Error('image not found'));
  expect(await fileApi.probeLocalImage('C:/source.html', 'file:///C:/missing.png')).toBe('missing');
  getToken.mockRejectedValueOnce(new Error('image path is outside document bounds'));
  expect(await fileApi.probeLocalImage('C:/source.html', 'file:///C:/restricted.png')).toBe('unknown');
  getToken.mockRejectedValueOnce(new Error('access denied'));
  expect(await fileApi.probeLocalImage('C:/source.html', 'file:///C:/restricted.png')).toBe('unknown');
});
