package auth

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	ErrPathTooLong      = errors.New("path exceeds maximum length of 4096")
	ErrInvalidPath      = errors.New("invalid or dangerous path")
	ErrUnauthorizedPath = errors.New("path is not authorized")
	ErrExportJobExpired = errors.New("export job expired or invalid")
)

var reservedWindowsNames = map[string]bool{
	"CON": true, "PRN": true, "AUX": true, "NUL": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true, "COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true, "LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true,
}

// ExportJobRecord records an authorized export target.
type ExportJobRecord struct {
	JobID      string
	TargetPath string
	Format     string
	ExpiresAt  time.Time
}

// Manager maintains authorizations for files, directories, and export jobs.
type Manager struct {
	mu              sync.RWMutex
	authorizedRoots map[string]bool // normalized absolute directory paths
	authorizedFiles map[string]bool // normalized absolute file paths
	exportJobs      map[string]*ExportJobRecord
}

var (
	defaultManager *Manager
	once           sync.Once
)

// Default returns the singleton auth Manager.
func Default() *Manager {
	once.Do(func() {
		defaultManager = NewManager()
	})
	return defaultManager
}

// NewManager creates a new auth Manager.
func NewManager() *Manager {
	return &Manager{
		authorizedRoots: make(map[string]bool),
		authorizedFiles: make(map[string]bool),
		exportJobs:      make(map[string]*ExportJobRecord),
	}
}

// NormalizePath validates and canonicalizes a path on Windows.
// Rejects device prefixes, reserved DOS device names, NUL characters, and ADS streams.
func NormalizePath(p string) (string, error) {
	if len(p) == 0 {
		return "", ErrInvalidPath
	}
	if len(p) > 4096 {
		return "", ErrPathTooLong
	}

	// Reject null bytes
	if strings.ContainsRune(p, 0) {
		return "", ErrInvalidPath
	}

	cleanP := filepath.Clean(p)

	// Reject raw device paths like \\.\ or \\?\ and network UNC paths (\\server\share, //server/share)
	if strings.HasPrefix(p, `\\`) || strings.HasPrefix(p, `//`) ||
		strings.HasPrefix(cleanP, `\\`) || strings.HasPrefix(cleanP, `//`) {
		return "", ErrInvalidPath
	}

	// Reject alternate data streams (:stream) except standard drive letter (e.g. C:)
	colonCount := strings.Count(cleanP, ":")
	if colonCount > 1 {
		return "", ErrInvalidPath
	}
	if colonCount == 1 {
		// Verify colon is only for drive letter at index 1 (e.g. "C:\...")
		if len(cleanP) < 2 || cleanP[1] != ':' {
			return "", ErrInvalidPath
		}
	}

	absPath, err := filepath.Abs(cleanP)
	if err != nil {
		return "", err
	}

	// Check reserved Windows names in all path segments
	parts := strings.Split(absPath, string(filepath.Separator))
	for _, part := range parts {
		upper := strings.ToUpper(part)
		// Check for base name before extension (e.g., NUL.txt, CON.md)
		baseName := upper
		if idx := strings.Index(upper, "."); idx != -1 {
			baseName = upper[:idx]
		}
		if reservedWindowsNames[baseName] {
			return "", ErrInvalidPath
		}
	}

	// Resolve symlinks / junctions if target exists
	realPath, err := filepath.EvalSymlinks(absPath)
	if err == nil {
		absPath = realPath
	} else if !os.IsNotExist(err) {
		// If it's a non-existence error, we keep absPath (might be a new file to create)
		// Otherwise return error
		return "", err
	}

	// Normalize drive letter to uppercase for consistent Windows comparisons
	if len(absPath) >= 2 && absPath[1] == ':' {
		absPath = strings.ToUpper(string(absPath[0])) + absPath[1:]
	}

	return filepath.Clean(absPath), nil
}

// AuthorizeFile grants authorization for a single file.
func (m *Manager) AuthorizeFile(p string) (string, error) {
	norm, err := NormalizePath(p)
	if err != nil {
		return "", err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.authorizedFiles[strings.ToLower(norm)] = true
	return norm, nil
}

// AuthorizeDirectory grants authorization for a directory and all its descendants.
func (m *Manager) AuthorizeDirectory(p string) (string, error) {
	norm, err := NormalizePath(p)
	if err != nil {
		return "", err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.authorizedRoots[strings.ToLower(norm)] = true
	return norm, nil
}

// RevokeDirectory removes authorization for a directory.
func (m *Manager) RevokeDirectory(p string) error {
	norm, err := NormalizePath(p)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.authorizedRoots, strings.ToLower(norm))
	return nil
}

// IsPathAuthorized checks if a normalized path is covered by any authorized root or authorized file.
func (m *Manager) IsPathAuthorized(p string) bool {
	norm, err := NormalizePath(p)
	if err != nil {
		return false
	}
	normLower := strings.ToLower(norm)

	m.mu.RLock()
	defer m.mu.RUnlock()

	// Check single file authorization
	if m.authorizedFiles[normLower] {
		return true
	}

	// Check root directories
	for rootLower := range m.authorizedRoots {
		rel, err := filepath.Rel(rootLower, normLower)
		if err == nil && !strings.HasPrefix(rel, "..") && rel != "." {
			return true
		}
		if rel == "." {
			return true
		}
	}

	return false
}

// ValidateFileRead validates path, verifies it exists and is authorized and has allowed extension.
func (m *Manager) ValidateFileRead(p string) (string, error) {
	norm, err := NormalizePath(p)
	if err != nil {
		return "", err
	}

	ext := strings.ToLower(filepath.Ext(norm))
	switch ext {
	case ".md", ".markdown", ".mdown", ".txt":
		// allowed
	default:
		return "", fmt.Errorf("file extension %s is not permitted for document reading", ext)
	}

	if !m.IsPathAuthorized(norm) {
		return "", ErrUnauthorizedPath
	}

	return norm, nil
}

// ValidateFileWrite validates path for writing (handles existing target or newly created file whose parent exists).
func (m *Manager) ValidateFileWrite(p string) (string, error) {
	norm, err := NormalizePath(p)
	if err != nil {
		return "", err
	}

	if m.IsPathAuthorized(norm) {
		return norm, nil
	}

	// If the file does not exist yet, check if parent directory is authorized
	parent := filepath.Dir(norm)
	if m.IsPathAuthorized(parent) {
		// Authorize the new file as well
		m.AuthorizeFile(norm)
		return norm, nil
	}

	return "", ErrUnauthorizedPath
}

// RegisterExportJob creates and stores an export job with a limited validity window.
func (m *Manager) RegisterExportJob(jobID, targetPath, format string, duration time.Duration) (*ExportJobRecord, error) {
	norm, err := NormalizePath(targetPath)
	if err != nil {
		return nil, err
	}

	rec := &ExportJobRecord{
		JobID:      jobID,
		TargetPath: norm,
		Format:     format,
		ExpiresAt:  time.Now().Add(duration),
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.exportJobs[jobID] = rec
	return rec, nil
}

// ValidateAndConsumeExportJob checks if the export job is valid and consumes it.
func (m *Manager) ValidateAndConsumeExportJob(jobID string) (*ExportJobRecord, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	rec, ok := m.exportJobs[jobID]
	if !ok || time.Now().After(rec.ExpiresAt) {
		delete(m.exportJobs, jobID)
		return nil, ErrExportJobExpired
	}

	delete(m.exportJobs, jobID)
	// Authorize the target file for write
	m.authorizedFiles[strings.ToLower(rec.TargetPath)] = true
	return rec, nil
}
