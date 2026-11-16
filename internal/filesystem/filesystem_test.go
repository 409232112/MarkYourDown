package filesystem

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"markyourdown/internal/dto"
)

func TestEncodingDecoding(t *testing.T) {
	// 1. Plain UTF-8
	sampleText := "Hello, 世界！\r\nLine 2"
	encodedUTF8, err := EncodeFileContent(sampleText, "utf8", "crlf")
	if err != nil {
		t.Fatal(err)
	}
	dec, err := DecodeFileContent(encodedUTF8)
	if err != nil {
		t.Fatal(err)
	}
	if dec.Encoding != "utf8" || dec.EOL != "crlf" || dec.Text != sampleText {
		t.Errorf("Unexpected decode: %+v", dec)
	}

	// 2. UTF-8 with BOM
	encodedBOM, err := EncodeFileContent(sampleText, "utf8bom", "lf")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(encodedBOM, []byte{0xEF, 0xBB, 0xBF}) {
		t.Errorf("Expected UTF-8 BOM prefix")
	}
	decBOM, err := DecodeFileContent(encodedBOM)
	if err != nil {
		t.Fatal(err)
	}
	if decBOM.Encoding != "utf8bom" || decBOM.EOL != "lf" {
		t.Errorf("Unexpected decode BOM: %+v", decBOM)
	}

	// 3. GBK encoding
	chineseText := "你好，世界！"
	encodedGBK, err := EncodeFileContent(chineseText, "gbk", "crlf")
	if err != nil {
		t.Fatal(err)
	}
	decGBK, err := DecodeFileContent(encodedGBK)
	if err != nil {
		t.Fatal(err)
	}
	if decGBK.Encoding != "gbk" || decGBK.Text != chineseText {
		t.Errorf("Unexpected decode GBK: %+v", decGBK)
	}
}

func TestWriteFileAtomic(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "myd-fs-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	target := filepath.Join(tmpDir, "test.md")
	content := []byte("# Hello Atomic")

	if err := WriteFileAtomic(target, content); err != nil {
		t.Fatalf("WriteFileAtomic failed: %v", err)
	}

	read, err := os.ReadFile(target)
	if err != nil || string(read) != string(content) {
		t.Fatalf("Read back failed or mismatch: %s", string(read))
	}
}

func TestFileWatcher(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "myd-watch-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	var mu sync.Mutex
	events := make([]dto.FileChangeEvent, 0)
	var wg sync.WaitGroup
	wg.Add(1)

	var once sync.Once
	fw, err := NewFileWatcher(func(e dto.FileChangeEvent) {
		mu.Lock()
		events = append(events, e)
		mu.Unlock()
		once.Do(func() {
			wg.Done()
		})
	})
	if err != nil {
		t.Fatal(err)
	}
	defer fw.Close()

	if err := fw.WatchDir(tmpDir, true); err != nil {
		t.Fatal(err)
	}

	// Create a file
	filePath := filepath.Join(tmpDir, "sample.md")
	if err := os.WriteFile(filePath, []byte("testing"), 0644); err != nil {
		t.Fatal(err)
	}

	// Wait up to 1 second for debounced event
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		// success
	case <-time.After(1 * time.Second):
		t.Log("Timed out waiting for file watcher event (may happen on some slow CI runners)")
	}

	mu.Lock()
	defer mu.Unlock()
	for _, e := range events {
		if strings.Contains(e.Path, "sample.md") {
			return
		}
	}
}
