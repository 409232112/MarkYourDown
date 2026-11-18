package services

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestOpenHTMLRecognizesFormatAndDoesNotGuessEncoding(t *testing.T) {
	SetCustomUserDataDir(t.TempDir())
	defer SetCustomUserDataDir("")
	path := filepath.Join(t.TempDir(), "Page.HTML")
	if err := os.WriteFile(path, []byte("<p>中文</p>"), 0600); err != nil {
		t.Fatal(err)
	}
	svc := NewFileService(NewSettingsService(), NewBackupService())
	doc, err := svc.openSelectedFile(path)
	if err != nil || doc.Format != "html" || doc.Content != "<p>中文</p>" {
		t.Fatalf("doc=%+v err=%v", doc, err)
	}
	if err := os.WriteFile(path, []byte{0x81, 0x40}, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.OpenFileByPath(path); err == nil {
		t.Fatal("undeclared non-UTF8 must require encoding")
	}
	doc, err = svc.OpenHtmlWithEncoding(path, "gb18030")
	if err != nil || doc.Format != "html" {
		t.Fatalf("explicit encoding: doc=%+v err=%v", doc, err)
	}
}

func TestHTMLImageFileURLResolvesForPreview(t *testing.T) {
	svc, req, _, _ := htmlTestFixture(t)
	token, err := svc.GetImageToken(req.SourcePath, req.References[0].Resolved)
	if err != nil || token == "" {
		t.Fatalf("file URL image token: %q %v", token, err)
	}
}

func TestReadDocumentBytesLimitsFileSize(t *testing.T) {
	path := filepath.Join(t.TempDir(), "large.html")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(MaxDocumentBytes + 1); err != nil {
		t.Fatal(err)
	}
	_ = f.Close()
	if _, err := readDocumentBytes(path); !errors.Is(err, ErrFileTooLarge) {
		t.Fatalf("got %v", err)
	}
}
