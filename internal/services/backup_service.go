package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"markyourdown/internal/auth"
	"markyourdown/internal/dto"
	"markyourdown/internal/filesystem"
)

var validDocIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// BackupService handles document auto-backup and session state.
type BackupService struct {
	mu sync.Mutex
}

// NewBackupService creates a new BackupService.
func NewBackupService() *BackupService {
	bs := &BackupService{}
	bs.cleanOldBackups()
	return bs
}

func getBackupsDir() (string, error) {
	dir, err := GetUserDataDir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, "backups")
	if err := os.MkdirAll(p, 0755); err != nil {
		return "", err
	}
	return p, nil
}

func getOverwrittenDir() (string, error) {
	dir, err := getBackupsDir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, "overwritten")
	if err := os.MkdirAll(p, 0755); err != nil {
		return "", err
	}
	return p, nil
}

func getSessionPath() (string, error) {
	dir, err := GetUserDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "session.json"), nil
}

// SaveBackup saves a document backup with CRC32 checksum.
func (b *BackupService) SaveBackup(item dto.BackupItem) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !validDocIDPattern.MatchString(item.ID) {
		return errors.New("invalid backup document ID")
	}

	dir, err := getBackupsDir()
	if err != nil {
		return err
	}

	item.V = 1
	item.SavedAt = time.Now().UnixMilli()
	item.CRC32 = crc32.ChecksumIEEE([]byte(item.Content))

	data, err := json.Marshal(item)
	if err != nil {
		return err
	}

	backupFile := filepath.Join(dir, fmt.Sprintf("%s.json", item.ID))
	return filesystem.WriteFileAtomic(backupFile, data)
}

// RemoveBackup deletes the backup file when document is saved or cleanly closed.
func (b *BackupService) RemoveBackup(docID string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if !validDocIDPattern.MatchString(docID) {
		return errors.New("invalid backup document ID")
	}

	dir, err := getBackupsDir()
	if err != nil {
		return err
	}

	backupFile := filepath.Join(dir, fmt.Sprintf("%s.json", docID))
	_ = os.Remove(backupFile)
	return nil
}

// ListBackups scans and returns all valid backups on startup, discarding corrupt ones.
func (b *BackupService) ListBackups() ([]dto.BackupItem, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	dir, err := getBackupsDir()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var results []dto.BackupItem
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		filePath := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		var item dto.BackupItem
		if err := json.Unmarshal(data, &item); err != nil {
			_ = os.Remove(filePath)
			continue
		}

		// Verify CRC32
		expectedCRC := crc32.ChecksumIEEE([]byte(item.Content))
		if item.CRC32 != expectedCRC {
			// CRC mismatch, discard corrupt backup
			_ = os.Remove(filePath)
			continue
		}

		results = append(results, item)
	}

	return results, nil
}

// AuthorizeRestoredDraftByID safely authorizes the file path recorded inside a valid backup JSON.
// Only paths recorded in existing backups, matching allowed file extensions, existing on disk,
// and not being directories will be authorized.
func (b *BackupService) AuthorizeRestoredDraftByID(backupID string) (bool, error) {
	if !validDocIDPattern.MatchString(backupID) {
		return false, fmt.Errorf("invalid backup ID")
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	dir, err := getBackupsDir()
	if err != nil {
		return false, err
	}

	backupFilePath := filepath.Join(dir, backupID+".json")
	data, err := os.ReadFile(backupFilePath)
	if err != nil {
		return false, fmt.Errorf("backup not found: %w", err)
	}

	var item dto.BackupItem
	if err := json.Unmarshal(data, &item); err != nil {
		return false, fmt.Errorf("failed to parse backup: %w", err)
	}

	// Untitled draft needs no filesystem authorization
	if item.Path == "" {
		return true, nil
	}

	ext := strings.ToLower(filepath.Ext(item.Path))
	if ext != ".md" && ext != ".markdown" && ext != ".mdown" && ext != ".txt" {
		return false, fmt.Errorf("unsupported file extension in backup: %s", ext)
	}

	norm, err := auth.NormalizePath(item.Path)
	if err != nil {
		return false, err
	}

	st, err := os.Stat(norm)
	if err != nil {
		return false, err // File does not exist anymore
	}
	if st.IsDir() {
		return false, fmt.Errorf("backup path is a directory")
	}

	_, err = auth.Default().AuthorizeFile(norm)
	return err == nil, err
}

// SaveOverwritten saves a disk copy before overwriting it during conflict resolution, keeping at most 5.
func (b *BackupService) SaveOverwritten(filePath, originalContent string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	dir, err := getOverwrittenDir()
	if err != nil {
		return err
	}

	baseName := filepath.Base(filePath)
	ext := filepath.Ext(baseName)
	nameWithoutExt := baseName[:len(baseName)-len(ext)]
	timestamp := time.Now().Format("20060102-150405")
	saveName := fmt.Sprintf("%s-%s%s", nameWithoutExt, timestamp, ext)
	savePath := filepath.Join(dir, saveName)

	if err := filesystem.WriteFileAtomic(savePath, []byte(originalContent)); err != nil {
		return err
	}

	// Keep at most 5 files
	entries, err := os.ReadDir(dir)
	if err == nil && len(entries) > 5 {
		type fileInfo struct {
			path    string
			modTime time.Time
		}
		var files []fileInfo
		for _, e := range entries {
			if !e.IsDir() {
				info, err := e.Info()
				if err == nil {
					files = append(files, fileInfo{path: filepath.Join(dir, e.Name()), modTime: info.ModTime()})
				}
			}
		}
		sort.Slice(files, func(i, j int) bool {
			return files[i].modTime.Before(files[j].modTime)
		})
		for i := 0; i < len(files)-5; i++ {
			_ = os.Remove(files[i].path)
		}
	}

	return nil
}

// SaveSession persists the open tabs and workspace session.
func (b *BackupService) SaveSession(session dto.SessionData) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	p, err := getSessionPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return err
	}

	return filesystem.WriteFileAtomic(p, data)
}

// LoadSession restores session data and re-validates authorized files and workspaces.
func (b *BackupService) LoadSession() (*dto.SessionData, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	p, err := getSessionPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(p)
	if err != nil {
		return nil, err
	}

	var session dto.SessionData
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, err
	}

	// Re-validate and re-authorize workspace path if it exists
	if session.WorkspacePath != "" {
		if info, err := os.Stat(session.WorkspacePath); err == nil && info.IsDir() {
			_, _ = auth.Default().AuthorizeDirectory(session.WorkspacePath)
		} else {
			session.WorkspacePath = ""
		}
	}

	// Re-validate each tab path
	validTabs := make([]dto.SessionTab, 0, len(session.Tabs))
	for _, tab := range session.Tabs {
		if tab.Path != "" {
			if _, err := os.Stat(tab.Path); err == nil {
				_, _ = auth.Default().AuthorizeFile(tab.Path)
				validTabs = append(validTabs, tab)
			}
		} else {
			// Untitled tab
			validTabs = append(validTabs, tab)
		}
	}
	session.Tabs = validTabs

	return &session, nil
}

func (b *BackupService) cleanOldBackups() {
	dir, err := getBackupsDir()
	if err != nil {
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	cutoff := time.Now().Add(-30 * 24 * time.Hour)
	var totalSize int64

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		fullPath := filepath.Join(dir, entry.Name())
		if info.ModTime().Before(cutoff) {
			_ = os.Remove(fullPath)
			continue
		}
		totalSize += info.Size()
	}

	// 100MB limit
	const maxBackupSize = 100 * 1024 * 1024
	if totalSize > maxBackupSize {
		// remove oldest backups
		type item struct {
			path    string
			modTime time.Time
			size    int64
		}
		var items []item
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			info, err := entry.Info()
			if err == nil {
				items = append(items, item{path: filepath.Join(dir, entry.Name()), modTime: info.ModTime(), size: info.Size()})
			}
		}
		sort.Slice(items, func(i, j int) bool {
			return items[i].modTime.Before(items[j].modTime)
		})
		for _, it := range items {
			_ = os.Remove(it.path)
			totalSize -= it.size
			if totalSize <= maxBackupSize {
				break
			}
		}
	}
}
