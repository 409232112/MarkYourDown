//go:build windows

package windows

import (
	"fmt"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	shell32              = syscall.NewLazyDLL("shell32.dll")
	procSHFileOperationW = shell32.NewProc("SHFileOperationW")
)

const (
	FO_DELETE          = 0x0003
	FOF_SILENT         = 0x0004
	FOF_NOCONFIRMATION = 0x0010
	FOF_ALLOWUNDO      = 0x0040
	FOF_NOERRORUI      = 0x0400
)

type shFileOpStructW struct {
	hwnd                  uintptr
	wFunc                 uint32
	pFrom                 *uint16
	pTo                   *uint16
	fFlags                uint16
	fAnyOperationsAborted int32
	hNameMappings         uintptr
	lpszProgressTitle     *uint16
}

// MoveToRecycleBin moves a file or directory to Windows Recycle Bin.
// It uses SHFileOperationW with FOF_ALLOWUNDO.
// If it fails, it returns an error and DOES NOT delete the file permanently.
func MoveToRecycleBin(targetPath string) error {
	absPath, err := filepath.Abs(targetPath)
	if err != nil {
		return err
	}

	// SHFileOperation requires double null-terminated UTF-16 string
	utf16Chars, err := syscall.UTF16FromString(absPath)
	if err != nil {
		return err
	}
	// Append second null terminator
	doubleNullChars := append(utf16Chars, 0)

	op := shFileOpStructW{
		wFunc:  FO_DELETE,
		pFrom:  &doubleNullChars[0],
		fFlags: FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI,
	}

	ret, _, _ := procSHFileOperationW.Call(uintptr(unsafe.Pointer(&op)))
	if ret != 0 {
		return fmt.Errorf("SHFileOperationW failed to send %q to recycle bin (code %d)", absPath, ret)
	}
	if op.fAnyOperationsAborted != 0 {
		return fmt.Errorf("recycle bin operation aborted for %q", absPath)
	}

	return nil
}
