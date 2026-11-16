package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"markyourdown/internal/auth"
	"markyourdown/internal/dto"
	"markyourdown/internal/filesystem"
	"markyourdown/internal/platform/windows"
)

// SettingsService manages user settings and recent files.
type SettingsService struct {
	mu sync.RWMutex
}

// NewSettingsService creates a new SettingsService.
func NewSettingsService() *SettingsService {
	return &SettingsService{}
}

func defaultSettings() *dto.AppSettings {
	return &dto.AppSettings{
		Theme:              "warm",
		ContentFont:        "serif",
		FontSize:           17,
		LineHeight:         1.8,
		ContentWidth:       1000,
		StartupAction:      "restore",
		AutoSave:           true,
		AutoSaveInterval:   3,
		AutoSaveOnBlur:     true,
		DefaultEOL:         "crlf",
		DefaultEncoding:    "utf8",
		ImageDir:           "sub",
		SoftWrap:           true,
		AutoCloseBrackets:  true,
		PasteAsMarkdown:    true,
		CodeLineNumbers:    false,
		CodeWrap:           false,
		CodeStripPrompt:    true,
		NetworkImagePolicy: "auto",
		HtmlEmbedImages:    true,
		HtmlIncludeToc:     false,
	}
}

func getSettingsPath() (string, error) {
	dir, err := GetUserDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "settings.json"), nil
}

func getRecentPath() (string, error) {
	dir, err := GetUserDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "recent.json"), nil
}

// GetSettings reads user settings, returning defaults if not found.
func (s *SettingsService) GetSettings() (*dto.AppSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	p, err := getSettingsPath()
	if err != nil {
		return defaultSettings(), nil
	}

	data, err := os.ReadFile(p)
	if err != nil {
		return defaultSettings(), nil
	}

	settings := defaultSettings()
	if err := json.Unmarshal(data, settings); err != nil {
		return defaultSettings(), nil
	}

	return settings, nil
}

// SaveSettings persists user settings to disk.
func (s *SettingsService) SaveSettings(settings dto.AppSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, err := getSettingsPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return filesystem.WriteFileAtomic(p, data)
}

// GetRecentFiles returns up to 12 recent documents.
func (s *SettingsService) GetRecentFiles() ([]dto.RecentFileItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	p, err := getRecentPath()
	if err != nil {
		return []dto.RecentFileItem{}, nil
	}

	data, err := os.ReadFile(p)
	if err != nil {
		return []dto.RecentFileItem{}, nil
	}

	var items []dto.RecentFileItem
	if err := json.Unmarshal(data, &items); err != nil {
		return []dto.RecentFileItem{}, nil
	}

	// Re-authorize valid existing recent files
	for _, it := range items {
		if _, statErr := os.Stat(it.Path); statErr == nil {
			_, _ = auth.Default().AuthorizeFile(it.Path)
		}
	}

	return items, nil
}

// AddRecentFile adds a document to recent files history and registers it with the Windows Shell.
func (s *SettingsService) AddRecentFile(filePath, title string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, err := getRecentPath()
	if err != nil {
		return err
	}

	var items []dto.RecentFileItem
	if data, err := os.ReadFile(p); err == nil {
		_ = json.Unmarshal(data, &items)
	}

	// Filter out duplicates (case-insensitive on Windows)
	filtered := make([]dto.RecentFileItem, 0, len(items))
	for _, item := range items {
		if !strings.EqualFold(item.Path, filePath) {
			filtered = append(filtered, item)
		}
	}

	if title == "" {
		title = filepath.Base(filePath)
	}

	newItem := dto.RecentFileItem{
		Path:       filePath,
		Title:      title,
		LastOpened: time.Now().UnixMilli(),
	}
	_, _ = auth.Default().AuthorizeFile(filePath)

	// Prepend
	result := append([]dto.RecentFileItem{newItem}, filtered...)
	if len(result) > 12 {
		result = result[:12]
	}

	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}

	_ = os.WriteFile(p, data, 0644)
	_ = windows.RegisterRecentDoc(filePath)

	return nil
}

// ClearRecentFiles removes all recent files history.
func (s *SettingsService) ClearRecentFiles() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, err := getRecentPath()
	if err != nil {
		return err
	}

	return os.WriteFile(p, []byte("[]"), 0644)
}

// RemoveRecentFile removes a single document from recent files history.
func (s *SettingsService) RemoveRecentFile(filePath string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, err := getRecentPath()
	if err != nil {
		return err
	}

	var items []dto.RecentFileItem
	if data, err := os.ReadFile(p); err == nil {
		_ = json.Unmarshal(data, &items)
	}

	filtered := make([]dto.RecentFileItem, 0, len(items))
	normTarget := filepath.Clean(filePath)
	for _, item := range items {
		normItem := filepath.Clean(item.Path)
		if !strings.EqualFold(normItem, normTarget) {
			filtered = append(filtered, item)
		}
	}

	data, err := json.MarshalIndent(filtered, "", "  ")
	if err != nil {
		return err
	}

	return filesystem.WriteFileAtomic(p, data)
}
