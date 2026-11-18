import { Window as WailsWindow } from '@wailsio/runtime';
import {
  FileService,
  WorkspaceService,
  SettingsService,
  ExportService,
  BackupService,
} from '../../bindings/markyourdown/internal/services';
import { exportToHtml } from '../export/toHtml';

export interface FileInfo {
  id: string;
  path: string;
  title: string;
  content: string;
  format?: 'markdown' | 'html';
  encoding: string;
  eol: 'crlf' | 'lf' | 'mixed';
  mtimeMs: number;
  size: number;
  hash: string;
}

export interface WorkspaceItem {
  name: string;
  path: string;
  isDir: boolean;
  children?: WorkspaceItem[];
}

export interface RecentItem {
  path: string;
  title: string;
  accessedAt: number;
}

// Window control wrappers
export const windowApi = {
  minimize: async () => {
    try {
      if (WailsWindow && typeof WailsWindow.Minimise === 'function') {
        WailsWindow.Minimise();
      }
    } catch (e) {
      console.warn('WailsWindow.Minimise failed or not in desktop mode', e);
    }
  },
  toggleMaximize: async () => {
    try {
      if (WailsWindow && typeof WailsWindow.ToggleMaximise === 'function') {
        WailsWindow.ToggleMaximise();
      }
    } catch (e) {
      console.warn('WailsWindow.ToggleMaximise failed', e);
    }
  },
  close: async () => {
    try {
      if (WailsWindow && typeof WailsWindow.Close === 'function') {
        WailsWindow.Close();
      }
    } catch (e) {
      console.warn('WailsWindow.Close failed', e);
    }
  },
  isMaximised: async (): Promise<boolean> => {
    try {
      if (WailsWindow && typeof WailsWindow.IsMaximised === 'function') {
        return await WailsWindow.IsMaximised();
      }
    } catch (e) {
      // ignore
    }
    return false;
  },
};

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
}

function toFileInfo(res: any): FileInfo {
  return {
    id: res.id || `doc-${Date.now()}`, path: res.path, title: res.title, content: res.content,
    format: res.format || (/\.html?$/i.test(res.path) ? 'html' : 'markdown'),
    encoding: res.encoding || 'utf8', eol: res.eol || 'crlf',
    mtimeMs: res.disk?.mtimeMs || Date.now(), size: res.disk?.size ?? res.content.length, hash: res.disk?.hash || '',
  };
}
async function retryHtmlEncoding(error: unknown, knownPath?: string): Promise<FileInfo | null> {
  const message = error instanceof Error ? error.message : String(error);
  const marker = /(?:UNSUPPORTED_ENCODING|DECODE_FAILED):/.exec(message);
  if (!marker || typeof window === 'undefined') {
    if (typeof window !== 'undefined') window.alert(`打开文件失败：${message}`);
    return null;
  }
  // The dialog authorizes the file before reading and prefixes its error with the selected path.
  const prefix = message.slice(0, marker.index).replace(/^Error:\s*/, '').replace(/:\s*$/, '').trim();
  const path = knownPath || prefix;
  if (!path || !/\.html?$/i.test(path)) {
    window.alert(`打开文件失败：${message}`);
    return null;
  }
  let detail = message;
  while (true) {
    const choice = window.prompt(`${detail}\n请输入编码：utf8、gbk 或 gb18030（取消则关闭）`, 'gb18030');
    if (choice === null) return null;
    const encoding = choice.trim().toLowerCase();
    if (!['utf8', 'utf-8', 'gbk', 'gb18030'].includes(encoding)) { detail = '不支持该编码。'; continue; }
    try {
      const res = await (FileService as any).OpenHtmlWithEncoding(path, encoding);
      return res ? toFileInfo(res) : null;
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
    }
  }
}

export const fileApi = {
  async openFileDialog(): Promise<FileInfo | null> {
    try {
      if (FileService && typeof FileService.OpenFileDialog === 'function') {
        const res = await FileService.OpenFileDialog();
        if (res) {
          return toFileInfo(res);
        }
      }
    } catch (e) {
      console.warn('FileService.OpenFileDialog error:', e);
      return retryHtmlEncoding(e);
    }
    return null;
  },

  async openFile(path: string): Promise<FileInfo | null> {
    try {
      if (FileService && typeof FileService.OpenFileByPath === 'function') {
        const res = await FileService.OpenFileByPath(path);
        if (res) {
          return toFileInfo(res);
        }
      }
    } catch (e) {
      console.warn('FileService.OpenFileByPath error:', e);
      return retryHtmlEncoding(e, path);
    }
    return null;
  },

  async saveFile(
    id: string,
    path: string,
    content: string,
    expectedHash?: string,
    encoding?: string,
    eol?: string,
    force = false
  ): Promise<{ success: boolean; hash: string; mtimeMs: number; size: number; status?: string; error?: string }> {
    if (typeof window === 'undefined') {
      return { success: true, status: 'clean', hash: 'mock-hash', mtimeMs: Date.now(), size: content.length };
    }
    try {
      if (FileService && typeof FileService.SaveFile === 'function') {
        const res = await FileService.SaveFile({
          documentId: id,
          path,
          content,
          revision: 1,
          expectedDiskHash: expectedHash || '',
          force,
          encoding: encoding || 'utf8',
          eol: eol || 'crlf',
        });
        if (res) {
          return {
            success: res.status === 'clean',
            status: res.status,
            hash: res.disk?.hash || '',
            mtimeMs: res.disk?.mtimeMs || Date.now(),
            size: res.disk?.size || content.length,
            error: res.error,
          };
        }
      }
    } catch (e: any) {
      return { success: false, hash: '', mtimeMs: 0, size: 0, error: e?.message || 'Save error' };
    }
    return { success: true, hash: 'mock-hash', mtimeMs: Date.now(), size: content.length };
  },

  async saveFileDialog(content: string, defaultName?: string, encoding?: string, eol?: string, documentId?: string): Promise<FileInfo | null> {
    if (typeof window === 'undefined') {
      return {
        id: documentId || `doc-${Date.now()}`,
        path: defaultName || 'Untitled.md',
        title: defaultName || 'Untitled.md',
        content,
        encoding: (encoding as any) || 'utf8',
        eol: (eol as any) || 'crlf',
        mtimeMs: Date.now(),
        size: content.length,
        hash: 'mock-hash',
      };
    }
    try {
      if (FileService && typeof FileService.SaveFileAs === 'function') {
        const res = await FileService.SaveFileAs({
          documentId: documentId || `doc-${Date.now()}`,
          path: defaultName || 'Untitled.md',
          content,
          revision: 1,
          expectedDiskHash: '',
          force: true,
          encoding: encoding || 'utf8',
          eol: eol || 'crlf',
        });
        if (res && res.status === 'clean') {
          const title = res.path.split(/[/\\]/).pop() || 'Untitled.md';
          return {
            id: res.documentId || `doc-${Date.now()}`,
            path: res.path,
            title,
            content,
            encoding: (encoding as any) || 'utf8',
            eol: (eol as any) || 'crlf',
            mtimeMs: res.disk?.mtimeMs || Date.now(),
            size: res.disk?.size || content.length,
            hash: res.disk?.hash || '',
          };
        }
      }
    } catch (e) {
      console.warn('FileService.SaveFileAs error:', e);
    }
    return null;
  },

  async checkStatus(docId: string, path: string, knownHash: string, knownMtime = 0, knownSize = 0): Promise<{ status: string; disk?: { mtimeMs: number; size: number; hash: string } } | null> {
    try {
      if (FileService && typeof (FileService as any).CheckExternalChange === 'function') {
        const res = await (FileService as any).CheckExternalChange(docId, path, knownHash, knownMtime, knownSize);
        if (res) return { status: res.status, disk: res.disk };
      }
    } catch (e) {
      console.warn('FileService.CheckExternalChange error:', e);
    }
    return null;
  },

  // Out-of-bounds, permission errors and unavailable runtimes are unknown, not missing.
  async probeLocalImage(docPath: string, imgPath: string): Promise<'available' | 'missing' | 'unknown'> {
    if (!docPath || !/^file:/i.test(imgPath) || !FileService || typeof FileService.GetImageToken !== 'function') return 'unknown';
    try {
      const token = await FileService.GetImageToken(docPath, imgPath);
      return token ? 'available' : 'unknown';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return /\bimage not found\b/i.test(message) ? 'missing' : 'unknown';
    }
  },

  async getImageToken(docPath: string, imgPath: string): Promise<string> {
    try {
      if (FileService && typeof FileService.GetImageToken === 'function') {
        const tokenUrl = await FileService.GetImageToken(docPath, imgPath);
        if (tokenUrl) {
          return tokenUrl;
        }
      }
    } catch (e) {
      console.warn('FileService.GetImageToken error:', e);
    }
    return imgPath;
  },

  async resolveImageAsDataUrl(docPath: string, imgPath: string): Promise<string> {
    if (!imgPath) return '';
    if (imgPath.startsWith('data:') || imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
      return imgPath;
    }
    try {
      if (FileService && typeof (FileService as any).ReadImageAsDataURL === 'function') {
        const dataUrl = await (FileService as any).ReadImageAsDataURL(docPath, imgPath);
        if (dataUrl) return dataUrl;
      }
    } catch (e) {
      console.warn('FileService.ReadImageAsDataURL error:', e);
    }
    try {
      const res = await fetch(imgPath);
      if (res.ok) {
        const blob = await res.blob();
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(imgPath);
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // ignore
    }
    return imgPath;
  },

  async getRecentFiles(): Promise<RecentItem[]> {
    try {
      if (SettingsService && typeof SettingsService.GetRecentFiles === 'function') {
        const res = await SettingsService.GetRecentFiles();
        if (res && Array.isArray(res)) {
          return res.map((r: any) => ({
            path: r.path,
            title: r.title,
            accessedAt: r.lastOpened || Date.now(),
          }));
        }
      }
    } catch (e) {
      // fallback
    }
    if (!hasLocalStorage()) return [];
    const local = localStorage.getItem('markyourdown_recent');
    return local ? JSON.parse(local) : [];
  },

  async addRecentFile(item: RecentItem): Promise<void> {
    try {
      if (SettingsService && typeof SettingsService.AddRecentFile === 'function') {
        await SettingsService.AddRecentFile(item.path, item.title);
        return;
      }
    } catch (e) {
      // fallback
    }
    if (!hasLocalStorage()) return;
    const recents = await this.getRecentFiles();
    const filtered = recents.filter((r) => r.path !== item.path);
    filtered.unshift(item);
    localStorage.setItem('markyourdown_recent', JSON.stringify(filtered.slice(0, 12)));
  },

  async removeRecentFile(filePath: string): Promise<void> {
    try {
      if (SettingsService && typeof (SettingsService as any).RemoveRecentFile === 'function') {
        await (SettingsService as any).RemoveRecentFile(filePath);
      }
    } catch (e) {
      console.warn('SettingsService.RemoveRecentFile error:', e);
    }
    if (hasLocalStorage()) {
      const recents = await this.getRecentFiles();
      const filtered = recents.filter((r) => r.path.toLowerCase() !== filePath.toLowerCase());
      localStorage.setItem('markyourdown_recent', JSON.stringify(filtered));
    }
  },

  async clearRecentFiles(): Promise<void> {
    try {
      if (SettingsService && typeof SettingsService.ClearRecentFiles === 'function') {
        await SettingsService.ClearRecentFiles();
        return;
      }
    } catch (e) {
      // fallback
    }
    if (hasLocalStorage()) {
      localStorage.removeItem('markyourdown_recent');
    }
  },
};

export const workspaceApi = {
  async openFolderDialog(): Promise<{ path: string; name: string } | null> {
    try {
      if (WorkspaceService && typeof WorkspaceService.OpenWorkspaceDialog === 'function') {
        const res = await WorkspaceService.OpenWorkspaceDialog();
        if (res) {
          return { path: res.rootPath, name: res.name };
        }
      }
    } catch (e) {
      console.warn('WorkspaceService.OpenWorkspaceDialog error:', e);
    }
    return null;
  },

  async listDirectory(dirPath: string): Promise<WorkspaceItem[]> {
    try {
      if (WorkspaceService && typeof WorkspaceService.GetWorkspaceTree === 'function') {
        const res = await WorkspaceService.GetWorkspaceTree(dirPath, false);
        if (res && res.children) {
          const mapItem = (c: any): WorkspaceItem => ({
            name: c.name,
            path: c.path,
            isDir: c.isDir,
            children: c.children?.map(mapItem),
          });
          return res.children.map(mapItem);
        }
      }
    } catch (e) {
      console.warn('WorkspaceService.GetWorkspaceTree error:', e);
    }
    return [];
  },

  async createFile(dirPath: string, name: string): Promise<{ path: string; success: boolean }> {
    try {
      if (WorkspaceService && typeof WorkspaceService.CreateFile === 'function') {
        const res = await WorkspaceService.CreateFile(dirPath, name);
        if (res) {
          return { path: res.path, success: true };
        }
      }
    } catch (e) {
      console.warn('WorkspaceService.CreateFile error:', e);
    }
    return { path: `${dirPath}/${name}`, success: true };
  },

  async createFolder(dirPath: string, name: string): Promise<{ path: string; success: boolean }> {
    try {
      if (WorkspaceService && typeof WorkspaceService.CreateDirectory === 'function') {
        const res = await WorkspaceService.CreateDirectory(dirPath, name);
        if (res) {
          return { path: res.path, success: true };
        }
      }
    } catch (e) {
      console.warn('WorkspaceService.CreateDirectory error:', e);
    }
    return { path: `${dirPath}/${name}`, success: true };
  },

  async renameItem(oldPath: string, newPath: string): Promise<{ success: boolean }> {
    try {
      if (WorkspaceService && typeof WorkspaceService.RenamePath === 'function') {
        await WorkspaceService.RenamePath(oldPath, newPath);
        return { success: true };
      }
    } catch (e) {
      console.warn('WorkspaceService.RenamePath error:', e);
      return { success: false };
    }
    return { success: true };
  },

  async deleteToRecycleBin(targetPath: string): Promise<{ success: boolean }> {
    try {
      if (WorkspaceService && typeof WorkspaceService.DeleteToRecycleBin === 'function') {
        await WorkspaceService.DeleteToRecycleBin(targetPath);
        return { success: true };
      }
    } catch (e) {
      console.warn('WorkspaceService.DeleteToRecycleBin error:', e);
      return { success: false };
    }
    return { success: true };
  },

  async revealInExplorer(targetPath: string): Promise<void> {
    try {
      if (WorkspaceService && typeof WorkspaceService.RevealInExplorer === 'function') {
        await WorkspaceService.RevealInExplorer(targetPath);
      }
    } catch (e) {
      console.warn('WorkspaceService.RevealInExplorer error:', e);
    }
  },
};

export const settingsApi = {
  async loadSettings(): Promise<any> {
    try {
      if (SettingsService && typeof SettingsService.GetSettings === 'function') {
        const res = await SettingsService.GetSettings();
        if (res) return res;
      }
    } catch (e) {
      // fallback
    }
    if (!hasLocalStorage()) return null;
    const local = localStorage.getItem('markyourdown_settings');
    return local ? JSON.parse(local) : null;
  },

  async saveSettings(settings: any): Promise<boolean> {
    try {
      if (SettingsService && typeof SettingsService.SaveSettings === 'function') {
        await SettingsService.SaveSettings(settings);
        return true;
      }
    } catch (e) {
      // fallback
    }
    if (hasLocalStorage()) {
      localStorage.setItem('markyourdown_settings', JSON.stringify(settings));
    }
    return true;
  },
};

export const exportApi = {
  async exportDocumentToHtml(docTitle: string, markdown: string, options?: any): Promise<{ success: boolean; targetPath?: string }> {
    try {
      const defaultName = docTitle.endsWith('.md') ? docTitle.replace(/\.md$/, '.html') : `${docTitle}.html`;
      if (ExportService && typeof ExportService.CreateExportJob === 'function') {
        const job = await ExportService.CreateExportJob({
          format: 'html',
          defaultName,
        });
        if (!job) return { success: false };

        const htmlStr = await exportToHtml(markdown, options);
        const bytes = new TextEncoder().encode(htmlStr);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const payloadBase64 = btoa(binary);

        await ExportService.WriteExportPayload({
          jobId: job.jobId,
          payloadBase64,
        });

        return { success: true, targetPath: job.targetPath };
      }
    } catch (e) {
      console.error('Export HTML error:', e);
    }
    return { success: false };
  },

  async revealExportFile(targetPath: string) {
    try {
      if (ExportService && typeof ExportService.RevealExportFile === 'function') {
        await ExportService.RevealExportFile(targetPath);
      }
    } catch (e) {
      console.warn('ExportService.RevealExportFile error:', e);
    }
  },
};

export const backupApi = {
  async saveBackup(item: { id: string; path?: string; title: string; content: string; eol?: string; encoding?: string; baseHash?: string }): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      if (BackupService && typeof BackupService.SaveBackup === 'function') {
        await BackupService.SaveBackup({
          v: 1,
          id: item.id,
          path: item.path || '',
          title: item.title,
          content: item.content,
          eol: item.eol || 'crlf',
          encoding: item.encoding || 'utf8',
          baseHash: item.baseHash || '',
          savedAt: Date.now(),
          crc32: 0,
        });
      }
    } catch (e) {
      console.warn('BackupService.SaveBackup error:', e);
    }
  },

  async removeBackup(docId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      if (BackupService && typeof BackupService.RemoveBackup === 'function') {
        await BackupService.RemoveBackup(docId);
      }
    } catch (e) {
      console.warn('BackupService.RemoveBackup error:', e);
    }
  },

  async listBackups(): Promise<any[]> {
    if (typeof window === 'undefined') return [];
    try {
      if (BackupService && typeof BackupService.ListBackups === 'function') {
        const res = await BackupService.ListBackups();
        return res || [];
      }
    } catch (e) {
      console.warn('BackupService.ListBackups error:', e);
    }
    return [];
  },

  async saveSession(session: any): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      if (BackupService && typeof BackupService.SaveSession === 'function') {
        await BackupService.SaveSession(session);
      }
    } catch (e) {
      console.warn('BackupService.SaveSession error:', e);
    }
  },

  async loadSession(): Promise<any | null> {
    if (typeof window === 'undefined') return null;
    try {
      if (BackupService && typeof BackupService.LoadSession === 'function') {
        return await BackupService.LoadSession();
      }
    } catch (e) {
      console.warn('BackupService.LoadSession error:', e);
    }
    return null;
  },

  async authorizeRestoredDraft(backupId: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      if (BackupService && typeof (BackupService as any).AuthorizeRestoredDraftByID === 'function') {
        const ok = await (BackupService as any).AuthorizeRestoredDraftByID(backupId);
        return ok === true;
      }
    } catch (e) {
      console.warn('BackupService.AuthorizeRestoredDraftByID error:', e);
    }
    return false;
  },
};
