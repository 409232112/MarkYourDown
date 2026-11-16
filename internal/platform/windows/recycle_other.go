//go:build !windows

package windows

import (
	"errors"
)

// MoveToRecycleBin is a stub on non-Windows platforms.
func MoveToRecycleBin(targetPath string) error {
	return errors.New("recycle bin is only supported on Windows")
}
