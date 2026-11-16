package filesystem

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"markyourdown/internal/platform/windows"
)

// WriteFileAtomic writes data to targetPath using a temporary file and atomic replacement.
func WriteFileAtomic(targetPath string, data []byte) error {
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	// Generate random name for .myd-{rand}.tmp
	randomBytes := make([]byte, 8)
	if _, err := rand.Read(randomBytes); err != nil {
		return err
	}
	tmpName := fmt.Sprintf(".myd-%s.tmp", hex.EncodeToString(randomBytes))
	tmpPath := filepath.Join(dir, tmpName)

	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create temporary file %s: %w", tmpPath, err)
	}

	if _, err := f.Write(data); err != nil {
		f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to write to temporary file: %w", err)
	}

	if err := f.Sync(); err != nil {
		f.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to sync temporary file: %w", err)
	}

	if err := f.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to close temporary file: %w", err)
	}

	// Commit atomically
	if err := windows.AtomicCommit(tmpPath, targetPath); err != nil {
		return err
	}

	return nil
}

// CleanStaleTempFiles scans a directory and removes any .myd-*.tmp files older than 24 hours.
func CleanStaleTempFiles(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}

	cutoff := time.Now().Add(-24 * time.Hour)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".myd-") && strings.HasSuffix(name, ".tmp") {
			info, err := entry.Info()
			if err == nil && info.ModTime().Before(cutoff) {
				_ = os.Remove(filepath.Join(dir, name))
			}
		}
	}
}
