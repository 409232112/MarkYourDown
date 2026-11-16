package windows

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicCommit(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "atomic-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	targetFile := filepath.Join(tmpDir, "target.md")
	tempFile := filepath.Join(tmpDir, ".myd-test.tmp")

	// 1. Commit when target does not exist
	if err := os.WriteFile(tempFile, []byte("Version 1"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := AtomicCommit(tempFile, targetFile); err != nil {
		t.Fatalf("AtomicCommit for new file failed: %v", err)
	}
	data, err := os.ReadFile(targetFile)
	if err != nil || string(data) != "Version 1" {
		t.Fatalf("Unexpected file content: %s, err: %v", string(data), err)
	}

	// 2. Commit when target already exists (ReplaceFileW)
	tempFile2 := filepath.Join(tmpDir, ".myd-test2.tmp")
	if err := os.WriteFile(tempFile2, []byte("Version 2"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := AtomicCommit(tempFile2, targetFile); err != nil {
		t.Fatalf("AtomicCommit replacing existing file failed: %v", err)
	}
	data, err = os.ReadFile(targetFile)
	if err != nil || string(data) != "Version 2" {
		t.Fatalf("Unexpected replaced file content: %s, err: %v", string(data), err)
	}
}
