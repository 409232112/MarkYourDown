package security_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"markyourdown/internal/auth"
)

type SecurityCorpus struct {
	Description          string   `json:"description"`
	PathTraversal        []string `json:"pathTraversal"`
	UncPaths             []string `json:"uncPaths"`
	DeviceNames          []string `json:"deviceNames"`
	AlternateDataStreams []string `json:"alternateDataStreams"`
	XssPayloads          []string `json:"xssPayloads"`
}

func loadCorpus(t *testing.T) SecurityCorpus {
	corpusPath := filepath.Join("corpus.json")
	data, err := os.ReadFile(corpusPath)
	if err != nil {
		t.Fatalf("Failed to read corpus.json: %v", err)
	}
	var corpus SecurityCorpus
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatalf("Failed to parse corpus.json: %v", err)
	}
	return corpus
}

func TestSecurityCorpus_PathSanitization(t *testing.T) {
	corpus := loadCorpus(t)
	m := auth.NewManager()

	// 1. Device names must be rejected
	for _, dev := range corpus.DeviceNames {
		testPath := filepath.Join(`C:\Users\test\docs`, dev)
		_, err := auth.NormalizePath(testPath)
		if err == nil {
			t.Errorf("NormalizePath allowed device name %q, expected error", dev)
		}
	}

	// 2. Alternate Data Streams must be rejected
	for _, ads := range corpus.AlternateDataStreams {
		testPath := filepath.Join(`C:\Users\test\docs`, ads)
		_, err := auth.NormalizePath(testPath)
		if err == nil {
			t.Errorf("NormalizePath allowed ADS %q, expected error", ads)
		}
	}

	// 3. UNC Paths and raw device prefixes must be rejected
	for _, unc := range corpus.UncPaths {
		_, err := auth.NormalizePath(unc)
		if err == nil {
			t.Errorf("NormalizePath allowed UNC path %q, expected error", unc)
		}
	}

	// 4. Unauthorized paths outside root must be rejected by manager
	tempDir, err := os.MkdirTemp("", "myd-sec-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	if _, err := m.AuthorizeDirectory(tempDir); err != nil {
		t.Fatal(err)
	}

	for _, trav := range corpus.PathTraversal {
		fullPath := filepath.Join(tempDir, trav)
		norm, normErr := auth.NormalizePath(fullPath)
		if normErr != nil {
			// Already cleanly rejected by NormalizePath
			continue
		}
		// If normalized, ensure manager refuses to read outside authorized root
		if !m.IsPathAuthorized(norm) {
			// Cleanly unauthorized
			continue
		}
		_, err := m.ValidateFileRead(norm)
		if err == nil {
			t.Errorf("Path traversal %q unexpectedly authorized and validated in %s", trav, tempDir)
		}
	}
}
