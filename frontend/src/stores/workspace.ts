import { defineStore } from 'pinia';
import { ref } from 'vue';
import { workspaceApi, type WorkspaceItem } from '../api';
import { useUiStore } from './ui';

const collator = new Intl.Collator('zh-CN', { numeric: true });

function sortItems(items: WorkspaceItem[]): WorkspaceItem[] {
  return [...items].sort((a, b) => {
    // Folders first
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return collator.compare(a.name, b.name);
  });
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const currentFolder = ref<{ path: string; name: string } | null>(null);
  const fileTree = ref<WorkspaceItem[]>([]);
  const expandedPaths = ref<Set<string>>(new Set());
  const selectedPath = ref<string | null>(null);

  async function openFolder() {
    const res = await workspaceApi.openFolderDialog();
    if (res) {
      currentFolder.value = res;
      expandedPaths.value.clear();
      expandedPaths.value.add(res.path);
      await loadDirectory(res.path);
      showOpenedFolder(res.name);
    }
  }

  async function openFolderPath(path: string, name?: string) {
    const folderName = name || path.split(/[/\\]/).filter(Boolean).pop() || path;
    currentFolder.value = { path, name: folderName };
    expandedPaths.value.clear();
    expandedPaths.value.add(path);
    await loadDirectory(path);
    showOpenedFolder(folderName);
  }

  function showOpenedFolder(name: string) {
    const ui = useUiStore();
    ui.focusMode = false;
    ui.setSidebarTab('files');
    ui.flashStatus(`已打开文件夹：${name}`, 3000);
  }

  async function loadDirectory(dirPath: string) {
    const items = await workspaceApi.listDirectory(dirPath);
    // Sort folders first, then files
    fileTree.value = sortItems(items);
  }

  async function refresh() {
    if (currentFolder.value) {
      await loadDirectory(currentFolder.value.path);
    }
  }

  function toggleFolder(path: string) {
    if (expandedPaths.value.has(path)) {
      expandedPaths.value.delete(path);
    } else {
      expandedPaths.value.add(path);
    }
  }

  function isExpanded(path: string): boolean {
    return expandedPaths.value.has(path);
  }

  async function createFile(parentPath: string, name: string) {
    const res = await workspaceApi.createFile(parentPath, name);
    if (res.success) {
      await refresh();
      return res.path;
    }
    return null;
  }

  async function createFolder(parentPath: string, name: string) {
    const res = await workspaceApi.createFolder(parentPath, name);
    if (res.success) {
      await refresh();
      return res.path;
    }
    return null;
  }

  async function renameItem(oldPath: string, newPath: string) {
    const res = await workspaceApi.renameItem(oldPath, newPath);
    if (res.success) {
      await refresh();
      return true;
    }
    return false;
  }

  async function deleteItem(targetPath: string) {
    const res = await workspaceApi.deleteToRecycleBin(targetPath);
    if (res.success) {
      await refresh();
      return true;
    }
    return false;
  }

  async function revealInExplorer(targetPath: string) {
    await workspaceApi.revealInExplorer(targetPath);
  }

  async function copyPath(targetPath: string) {
    try {
      await navigator.clipboard.writeText(targetPath);
    } catch (e) {
      console.warn('Failed to copy path', e);
    }
  }

  return {
    currentFolder,
    fileTree,
    expandedPaths,
    selectedPath,
    openFolder,
    openFolderPath,
    loadDirectory,
    refresh,
    toggleFolder,
    isExpanded,
    createFile,
    createFolder,
    renameItem,
    deleteItem,
    revealInExplorer,
    copyPath,
  };
});
