package services

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"markyourdown/internal/auth"
	"markyourdown/internal/dto"
	"markyourdown/internal/filesystem"
	"markyourdown/internal/platform/windows"
)

var (
	ErrWorkspaceUnauthorized = errors.New("workspace root is not authorized")
	ErrPathOutsideWorkspace  = errors.New("operation path is outside authorized workspace")
)

// WorkspaceService handles folder browsing, tree scanning, file tree operations, and directory watching.
type WorkspaceService struct {
	mu          sync.Mutex
	activeRoots map[string]bool
	watcher     *filesystem.FileWatcher
}

// NewWorkspaceService creates a new WorkspaceService.
func NewWorkspaceService() *WorkspaceService {
	ws := &WorkspaceService{
		activeRoots: make(map[string]bool),
	}

	w, err := filesystem.NewFileWatcher(func(e dto.FileChangeEvent) {
		app := GetApp()
		if app != nil {
			app.Event.Emit("workspace:file-changed", e)
		}
	})
	if err == nil {
		ws.watcher = w
	}

	return ws
}

// OpenWorkspaceDialog prompts the user to choose a workspace directory.
func (ws *WorkspaceService) OpenWorkspaceDialog() (*dto.WorkspaceInfo, error) {
	app := GetApp()
	if app == nil {
		return nil, errors.New("application not initialized")
	}

	dialog := app.Dialog.OpenFile()
	dialog.CanChooseDirectories(true)
	dialog.CanChooseFiles(false)
	dialog.SetTitle("选择工作区文件夹")

	chosenPath, err := dialog.PromptForSingleSelection()
	if err != nil {
		return nil, err
	}
	if chosenPath == "" {
		return nil, nil // user cancelled
	}

	return ws.openSelectedWorkspace(chosenPath)
}

// Only paths returned by the native folder picker may be authorized here.
func (ws *WorkspaceService) openSelectedWorkspace(chosenPath string) (*dto.WorkspaceInfo, error) {
	path, err := auth.Default().AuthorizeDirectory(chosenPath)
	if err != nil {
		return nil, err
	}
	return ws.OpenWorkspaceByPath(path)
}

// OpenWorkspaceByPath watches and returns the workspace tree for an already-authorized directory.
func (ws *WorkspaceService) OpenWorkspaceByPath(dirPath string) (*dto.WorkspaceInfo, error) {
	norm, err := auth.NormalizePath(dirPath)
	if err != nil {
		return nil, err
	}

	// Must be pre-authorized via trusted channels (native dialog, drag-and-drop, CLI, or session restore)
	if !auth.Default().IsPathAuthorized(norm) {
		return nil, ErrWorkspaceUnauthorized
	}

	stat, err := os.Stat(norm)
	if err != nil || !stat.IsDir() {
		return nil, fmt.Errorf("path is not a valid directory: %s", norm)
	}

	ws.mu.Lock()
	ws.activeRoots[strings.ToLower(norm)] = true
	ws.mu.Unlock()

	// Clean stale temp files in this workspace
	filesystem.CleanStaleTempFiles(norm)

	// Watch workspace directory recursively
	if ws.watcher != nil {
		_ = ws.watcher.WatchDir(norm, true)
	}

	tree, err := ws.GetWorkspaceTree(norm, false)
	if err != nil {
		return nil, err
	}

	return &dto.WorkspaceInfo{
		RootPath: norm,
		Name:     filepath.Base(norm),
		Tree:     tree,
	}, nil
}

// GetWorkspaceTree builds a hierarchical tree of folders and documents.
func (ws *WorkspaceService) GetWorkspaceTree(rootPath string, showAll bool) (*dto.FileTreeNode, error) {
	norm, err := auth.NormalizePath(rootPath)
	if err != nil {
		return nil, err
	}

	if !auth.Default().IsPathAuthorized(norm) {
		return nil, ErrWorkspaceUnauthorized
	}

	return buildTree(norm, showAll)
}

func buildTree(dirPath string, showAll bool) (*dto.FileTreeNode, error) {
	if _, err := os.Stat(dirPath); err != nil {
		return nil, err
	}

	node := &dto.FileTreeNode{
		Name:     filepath.Base(dirPath),
		Path:     dirPath,
		IsDir:    true,
		Children: make([]*dto.FileTreeNode, 0),
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return node, nil
	}

	var dirs []*dto.FileTreeNode
	var files []*dto.FileTreeNode

	for _, entry := range entries {
		name := entry.Name()
		// Ignore hidden files, .git, node_modules
		if strings.HasPrefix(name, ".") || name == "node_modules" {
			continue
		}

		fullPath := filepath.Join(dirPath, name)
		if entry.IsDir() {
			child, err := buildTree(fullPath, showAll)
			if err == nil {
				dirs = append(dirs, child)
			}
		} else {
			ext := strings.ToLower(filepath.Ext(name))
			if showAll || ext == ".md" || ext == ".markdown" || ext == ".mdown" || ext == ".txt" || ext == ".html" || ext == ".htm" {
				info, err := entry.Info()
				var size int64
				if err == nil {
					size = info.Size()
				}
				files = append(files, &dto.FileTreeNode{
					Name:  name,
					Path:  fullPath,
					IsDir: false,
					Size:  size,
				})
			}
		}
	}

	// Sort directories and files alphabetically (case-insensitive)
	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})
	sort.Slice(files, func(i, j int) bool {
		return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
	})

	// Directories first
	node.Children = append(dirs, files...)
	return node, nil
}

// CreateFile creates a new empty file in parentDir within the authorized workspace.
func (ws *WorkspaceService) CreateFile(parentDir, name string) (*dto.FileTreeNode, error) {
	normParent, err := auth.NormalizePath(parentDir)
	if err != nil {
		return nil, err
	}

	if !auth.Default().IsPathAuthorized(normParent) {
		return nil, ErrPathOutsideWorkspace
	}

	cleanName := filepath.Base(filepath.Clean(name))
	if cleanName == "." || cleanName == ".." || cleanName != name || strings.ContainsAny(cleanName, `/\:*"<>|`) {
		return nil, fmt.Errorf("invalid file name: %q", name)
	}

	ext := strings.ToLower(filepath.Ext(cleanName))
	if ext != ".md" && ext != ".markdown" && ext != ".mdown" && ext != ".txt" {
		return nil, fmt.Errorf("unsupported file extension: %s", ext)
	}

	targetPath := filepath.Join(normParent, cleanName)
	normTarget, err := auth.NormalizePath(targetPath)
	if err != nil {
		return nil, err
	}

	// Check if already exists
	if _, err := os.Stat(normTarget); err == nil {
		return nil, fmt.Errorf("file %q already exists", name)
	}

	if err := filesystem.WriteFileAtomic(normTarget, []byte("")); err != nil {
		return nil, err
	}

	_, _ = auth.Default().AuthorizeFile(normTarget)

	return &dto.FileTreeNode{
		Name:  filepath.Base(normTarget),
		Path:  normTarget,
		IsDir: false,
		Size:  0,
	}, nil
}

// CreateDirectory creates a new subfolder in parentDir within the authorized workspace.
func (ws *WorkspaceService) CreateDirectory(parentDir, name string) (*dto.FileTreeNode, error) {
	normParent, err := auth.NormalizePath(parentDir)
	if err != nil {
		return nil, err
	}

	if !auth.Default().IsPathAuthorized(normParent) {
		return nil, ErrPathOutsideWorkspace
	}

	cleanName := filepath.Base(filepath.Clean(name))
	if cleanName == "." || cleanName == ".." || cleanName != name || strings.ContainsAny(cleanName, `/\:*"<>|`) {
		return nil, fmt.Errorf("invalid directory name: %q", name)
	}

	targetPath := filepath.Join(normParent, cleanName)
	normTarget, err := auth.NormalizePath(targetPath)
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(normTarget, 0755); err != nil {
		return nil, err
	}

	if ws.watcher != nil {
		_ = ws.watcher.WatchDir(normTarget, true)
	}

	return &dto.FileTreeNode{
		Name:     filepath.Base(normTarget),
		Path:     normTarget,
		IsDir:    true,
		Children: []*dto.FileTreeNode{},
	}, nil
}

// RenamePath renames a file or directory within the authorized workspace.
func (ws *WorkspaceService) RenamePath(oldPath, newName string) (string, error) {
	normOld, err := auth.NormalizePath(oldPath)
	if err != nil {
		return "", err
	}

	if !auth.Default().IsPathAuthorized(normOld) {
		return "", ErrPathOutsideWorkspace
	}

	cleanName := filepath.Base(filepath.Clean(newName))
	if cleanName == "." || cleanName == ".." || cleanName != newName || strings.ContainsAny(cleanName, `/\:*"<>|`) {
		return "", fmt.Errorf("invalid file name: %q", newName)
	}

	// Check extension if renaming a file
	oldStat, err := os.Stat(normOld)
	if err != nil {
		return "", err
	}
	if !oldStat.IsDir() {
		ext := strings.ToLower(filepath.Ext(cleanName))
		if ext != ".md" && ext != ".markdown" && ext != ".mdown" && ext != ".txt" && ext != ".html" && ext != ".htm" {
			return "", fmt.Errorf("unsupported file extension: %s", ext)
		}
	}

	parent := filepath.Dir(normOld)
	newPath := filepath.Join(parent, cleanName)
	normNew, err := auth.NormalizePath(newPath)
	if err != nil {
		return "", err
	}

	// Prevent silent overwrite if target already exists
	if _, err := os.Stat(normNew); err == nil && !strings.EqualFold(normOld, normNew) {
		return "", fmt.Errorf("target file or directory %q already exists", cleanName)
	}

	if err := os.Rename(normOld, normNew); err != nil {
		return "", fmt.Errorf("rename failed: %w", err)
	}

	_, _ = auth.Default().AuthorizeFile(normNew)
	return normNew, nil
}

// DeleteToRecycleBin safely deletes a file or directory by sending it to the Windows Recycle Bin.
// Failure does NOT degrade to permanent deletion.
func (ws *WorkspaceService) DeleteToRecycleBin(targetPath string) error {
	norm, err := auth.NormalizePath(targetPath)
	if err != nil {
		return err
	}

	if !auth.Default().IsPathAuthorized(norm) {
		return ErrPathOutsideWorkspace
	}

	return windows.MoveToRecycleBin(norm)
}

// RevealInExplorer shows the file or directory in Windows File Explorer.
func (ws *WorkspaceService) RevealInExplorer(targetPath string) error {
	norm, err := auth.NormalizePath(targetPath)
	if err != nil {
		return err
	}

	return windows.RevealInExplorer(norm)
}

// CloseWorkspace stops watching and revokes workspace root authorization.
func (ws *WorkspaceService) CloseWorkspace(rootPath string) error {
	norm, err := auth.NormalizePath(rootPath)
	if err != nil {
		return err
	}

	ws.mu.Lock()
	delete(ws.activeRoots, strings.ToLower(norm))
	ws.mu.Unlock()

	if ws.watcher != nil {
		_ = ws.watcher.Unwatch(norm)
	}

	return auth.Default().RevokeDirectory(norm)
}
