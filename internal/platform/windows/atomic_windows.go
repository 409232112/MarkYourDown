//go:build windows

package windows

import (
	"fmt"
	"os"
	"syscall"
	"time"
	"unsafe"

	syswin "golang.org/x/sys/windows"
)

var (
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	procReplaceFile = kernel32.NewProc("ReplaceFileW")
)

const (
	REPLACEFILE_WRITE_THROUGH = 0x00000001
	MOVEFILE_REPLACE_EXISTING = 0x00000001
	MOVEFILE_WRITE_THROUGH    = 0x00000008
)

// AtomicCommit commits the temporary file tmpPath over targetPath.
// If targetPath exists, it attempts ReplaceFileW. If targetPath doesn't exist, it uses MoveFileEx.
// It retries up to 3 times with 200ms delay if target is temporarily locked.
func AtomicCommit(tmpPath, targetPath string) error {
	var lastErr error

	tmpUTF16, err := syswin.UTF16PtrFromString(tmpPath)
	if err != nil {
		return err
	}
	targetUTF16, err := syswin.UTF16PtrFromString(targetPath)
	if err != nil {
		return err
	}

	for attempt := 0; attempt < 3; attempt++ {
		// Check if target file already exists
		_, statErr := os.Stat(targetPath)
		if statErr == nil {
			// File exists, try ReplaceFileW(target, tmp, backup, flags, exclude, reserved)
			r1, _, callErr := procReplaceFile.Call(
				uintptr(unsafe.Pointer(targetUTF16)),
				uintptr(unsafe.Pointer(tmpUTF16)),
				0, // no backup file
				REPLACEFILE_WRITE_THROUGH,
				0,
				0,
			)
			if r1 != 0 {
				return nil
			}
			lastErr = callErr
		} else {
			// Target does not exist, use MoveFileEx
			err := syswin.MoveFileEx(tmpUTF16, targetUTF16, MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)
			if err == nil {
				return nil
			}
			lastErr = err
		}

		time.Sleep(200 * time.Millisecond)
	}

	return fmt.Errorf("atomic commit failed after 3 attempts: %w", lastErr)
}
