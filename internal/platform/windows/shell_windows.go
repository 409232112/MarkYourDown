//go:build windows

package windows

import (
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	procSHAddToRecentDocs = shell32.NewProc("SHAddToRecentDocs")
)

const (
	SHARD_PATHW = 0x00000003
)

// RegisterRecentDoc registers a document path with the Windows Shell recent documents list.
func RegisterRecentDoc(filePath string) error {
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return err
	}

	utf16Ptr, err := syscall.UTF16PtrFromString(absPath)
	if err != nil {
		return err
	}

	procSHAddToRecentDocs.Call(SHARD_PATHW, uintptr(unsafe.Pointer(utf16Ptr)))
	return nil
}

// RevealInExplorer highlights the given file or folder in Windows File Explorer.
func RevealInExplorer(targetPath string) error {
	absPath, err := filepath.Abs(targetPath)
	if err != nil {
		return err
	}

	cmd := exec.Command("explorer.exe", "/select,"+absPath)
	return cmd.Start()
}
