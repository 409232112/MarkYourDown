//go:build !windows

package services

import (
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func promptDocumentSavePath(app *application.App, suggested string) (string, error) {
	dialog := app.Dialog.SaveFile()
	dialog.AddFilter("Markdown 文档 (*.md)", "*.md")
	dialog.AddFilter("文本文件 (*.txt)", "*.txt")
	if suggested != "" {
		dialog.SetFilename(filepath.Base(suggested))
		if filepath.IsAbs(suggested) {
			dialog.SetDirectory(filepath.Dir(suggested))
		}
	} else {
		dialog.SetFilename("未命名.md")
	}
	return dialog.PromptForSingleSelection()
}
