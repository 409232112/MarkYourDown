package auth

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNormalizePath(t *testing.T) {
	// Dangerous paths should be rejected
	badPaths := []string{
		"",
		`\\.\PhysicalDrive0`,
		`\\?\C:\secret`,
		`\\attacker.com\share`,
		`//attacker.com/share`,
		`\\localhost\c$`,
		`C:\test\NUL`,
		`C:\test\CON.md`,
		`C:\test\aux.txt`,
		`C:\test\file.txt:stream`,
		string([]byte{'C', ':', '\\', 0, 'a'}),
	}

	for _, p := range badPaths {
		_, err := NormalizePath(p)
		if err == nil {
			t.Errorf("NormalizePath(%q) expected error, got nil", p)
		}
	}
}

func TestAuthorization(t *testing.T) {
	m := NewManager()

	tmpDir, err := os.MkdirTemp("", "myd-auth-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	subDir := filepath.Join(tmpDir, "docs")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatal(err)
	}

	testFile := filepath.Join(subDir, "readme.md")
	if err := os.WriteFile(testFile, []byte("# Hello"), 0644); err != nil {
		t.Fatal(err)
	}

	// Before authorization
	if m.IsPathAuthorized(testFile) {
		t.Errorf("expected unauthorized for %s", testFile)
	}

	// Authorize directory
	if _, err := m.AuthorizeDirectory(tmpDir); err != nil {
		t.Fatalf("AuthorizeDirectory failed: %v", err)
	}

	if !m.IsPathAuthorized(testFile) {
		t.Errorf("expected authorized for %s inside authorized root", testFile)
	}

	// ValidateFileRead with allowed extension
	validPath, err := m.ValidateFileRead(testFile)
	if err != nil {
		t.Errorf("ValidateFileRead failed: %v", err)
	}
	if !strings.EqualFold(validPath, testFile) {
		t.Errorf("got %s, expected %s", validPath, testFile)
	}

	// ValidateFileRead with unallowed extension
	exeFile := filepath.Join(tmpDir, "bad.exe")
	if err := os.WriteFile(exeFile, []byte("echo"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := m.ValidateFileRead(exeFile); err == nil {
		t.Errorf("expected error for .exe read, got nil")
	}

	// Outside file
	outsideDir, err := os.MkdirTemp("", "myd-auth-outside-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(outsideDir)
	outsideFile := filepath.Join(outsideDir, "secret.md")
	_ = os.WriteFile(outsideFile, []byte("secret"), 0644)

	if m.IsPathAuthorized(outsideFile) {
		t.Errorf("outside file should not be authorized")
	}

	// Single file authorization
	if _, err := m.AuthorizeFile(outsideFile); err != nil {
		t.Fatalf("AuthorizeFile failed: %v", err)
	}
	if !m.IsPathAuthorized(outsideFile) {
		t.Errorf("outside file should be authorized after AuthorizeFile")
	}
}

func TestExportJob(t *testing.T) {
	m := NewManager()
	target := filepath.Join(os.TempDir(), "exported.html")

	rec, err := m.RegisterExportJob("job-123", target, "html", 100*time.Millisecond)
	if err != nil {
		t.Fatalf("RegisterExportJob failed: %v", err)
	}
	if rec.JobID != "job-123" {
		t.Errorf("unexpected job ID %s", rec.JobID)
	}

	// Consume job
	consumed, err := m.ValidateAndConsumeExportJob("job-123")
	if err != nil {
		t.Fatalf("ValidateAndConsumeExportJob failed: %v", err)
	}
	if consumed.JobID != "job-123" {
		t.Errorf("unexpected consumed job ID %s", consumed.JobID)
	}

	// Consume again should fail
	if _, err := m.ValidateAndConsumeExportJob("job-123"); err == nil {
		t.Errorf("consuming already consumed job should fail")
	}
}
