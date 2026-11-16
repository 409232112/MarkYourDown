//go:build windows

package services

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"unicode/utf16"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/sys/windows"
)

// OPENFILENAMEW, including the fields introduced in Windows 2000.
type openFileName struct {
	size                         uint32
	owner, instance              uintptr
	filter, customFilter         *uint16
	maxCustomFilter, filterIndex uint32
	file                         *uint16
	maxFile                      uint32
	fileTitle                    *uint16
	maxFileTitle                 uint32
	initialDir, title            *uint16
	flags                        uint32
	fileOffset, extension        uint16
	defaultExt                   *uint16
	customData, hook             uintptr
	template                     *uint16
	reserved                     unsafe.Pointer
	reservedValue, flagsEx       uint32
}

var (
	commonDialogs        = windows.NewLazySystemDLL("comdlg32.dll")
	getSaveFileName      = commonDialogs.NewProc("GetSaveFileNameW")
	commDlgExtendedError = commonDialogs.NewProc("CommDlgExtendedError")
)

// Windows shell extensions can delay a file dialog; keep that work off the
// Wails UI thread so the editor continues to respond while it opens.
func promptDocumentSavePath(app *application.App, suggested string) (string, error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	name := "未命名.md"
	dir, _ := os.UserHomeDir()
	if suggested != "" {
		name = filepath.Base(suggested)
		if filepath.IsAbs(suggested) {
			dir = filepath.Dir(suggested)
		}
	}
	buffer := make([]uint16, 32768)
	utfName, err := windows.UTF16FromString(name)
	if err != nil {
		return "", err
	}
	copy(buffer, utfName)
	filters := utf16.Encode([]rune("Markdown 文档 (*.md)\x00*.md\x00文本文件 (*.txt)\x00*.txt\x00\x00"))
	var dirPtr *uint16
	if dir != "" {
		dirPtr, _ = windows.UTF16PtrFromString(dir)
	}
	extension, _ := windows.UTF16PtrFromString("md")
	var owner uintptr
	if app != nil {
		if windowsList := app.Window.GetAll(); len(windowsList) > 0 {
			owner = uintptr(windowsList[0].NativeWindow())
		}
	}
	dialog := openFileName{
		size:   uint32(unsafe.Sizeof(openFileName{})),
		owner:  owner,
		filter: &filters[0], filterIndex: 1,
		file: &buffer[0], maxFile: uint32(len(buffer)), initialDir: dirPtr,
		flags:      0x00080000 | 0x00000002 | 0x00000800 | 0x00000008,
		defaultExt: extension,
	}
	result, _, _ := getSaveFileName.Call(uintptr(unsafe.Pointer(&dialog)))
	if result == 0 {
		code, _, _ := commDlgExtendedError.Call()
		if code != 0 {
			return "", fmt.Errorf("save dialog failed: 0x%x", code)
		}
		return "", nil
	}
	return windows.UTF16ToString(buffer), nil
}
