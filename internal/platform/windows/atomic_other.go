//go:build !windows

package windows

import (
	"fmt"
	"os"
	"time"
)

// AtomicCommit commits the temporary file tmpPath over targetPath.
func AtomicCommit(tmpPath, targetPath string) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		err := os.Rename(tmpPath, targetPath)
		if err == nil {
			return nil
		}
		lastErr = err
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("atomic rename failed after 3 attempts: %w", lastErr)
}
