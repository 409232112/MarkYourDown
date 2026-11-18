package services

import (
	"encoding/base64"
	"encoding/json"
	"markyourdown/internal/dto"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func htmlTestFixture(t *testing.T) (*FileService, dto.BeginHtmlSaveRequest, string, string) {
	t.Helper()
	dir := t.TempDir()
	source := filepath.Join(dir, "source.html")
	if err := os.WriteFile(source, []byte("<p>Hello</p>"), 0644); err != nil {
		t.Fatal(err)
	}
	image := filepath.Join(dir, "image.png")
	bytes, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aQAAAABJRU5ErkJggg==")
	if err := os.WriteFile(image, bytes, 0644); err != nil {
		t.Fatal(err)
	}
	u := url.URL{Scheme: "file", Path: filepath.ToSlash(image)}
	if !strings.HasPrefix(u.Path, "/") {
		u.Path = "/" + u.Path
	}
	svc := NewFileService(nil, nil)
	req := dto.BeginHtmlSaveRequest{SourcePath: source, References: []dto.HtmlReference{{ID: "i", Kind: "image", Resolved: u.String(), Original: "image.png"}}}
	return svc, req, filepath.Join(dir, "output.md"), image
}
func TestHtmlSaveCopiesAssetsAndAbortAfterCommit(t *testing.T) {
	svc, req, target, _ := htmlTestFixture(t)
	out, err := svc.beginHtmlSaveAt(req, target)
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Rewrites) != 1 {
		t.Fatalf("rewrites: %#v warnings: %#v", out.Rewrites, out.Warnings)
	}
	markdown := "![x](" + out.Rewrites[0].To + ")\n"
	saved, err := svc.CommitHtmlSave(dto.CommitHtmlSaveRequest{Ticket: out.Ticket, Markdown: markdown, EOL: "crlf"})
	if err != nil || saved.Status != "saved" {
		t.Fatalf("save: %#v %v", saved, err)
	}
	result, err := os.ReadFile(target)
	if err != nil || !strings.Contains(string(result), "\r\n") {
		t.Fatalf("output: %q %v", result, err)
	}
	asset, err := url.PathUnescape(out.Rewrites[0].To)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(filepath.Join(filepath.Dir(target), filepath.FromSlash(asset))); err != nil {
		t.Fatal(err)
	}
	aborted, _ := svc.AbortHtmlSave(dto.AbortHtmlSaveRequest{Ticket: out.Ticket})
	if aborted.Status != "committed" {
		t.Fatal(aborted)
	}
	if _, err = os.Stat(target); err != nil {
		t.Fatal(err)
	}
}
func TestHtmlSaveDetectsExternalChanges(t *testing.T) {
	for _, tc := range []struct {
		name, code string
		mutate     func(string, string)
	}{{"target", "TARGET_CHANGED", func(target, image string) { _ = os.WriteFile(target, []byte("changed"), 0644) }}, {"image", "ASSET_CHANGED", func(target, image string) { _ = os.WriteFile(image, []byte("changed"), 0644) }}} {
		t.Run(tc.name, func(t *testing.T) {
			svc, req, target, image := htmlTestFixture(t)
			out, err := svc.beginHtmlSaveAt(req, target)
			if err != nil {
				t.Fatal(err)
			}
			tc.mutate(target, image)
			saved, err := svc.CommitHtmlSave(dto.CommitHtmlSaveRequest{Ticket: out.Ticket, Markdown: "hello"})
			if err != nil || saved.Code != tc.code {
				t.Fatalf("got %#v %v", saved, err)
			}
			_, _ = svc.AbortHtmlSave(dto.AbortHtmlSaveRequest{Ticket: out.Ticket})
		})
	}
}
func TestHtmlSaveRejectsInvalidTargetAndAbort(t *testing.T) {
	svc, req, target, _ := htmlTestFixture(t)
	if _, err := svc.beginHtmlSaveAt(req, req.SourcePath); err == nil {
		t.Fatal("source accepted")
	}
	if _, err := svc.beginHtmlSaveAt(req, target+".html"); err == nil {
		t.Fatal("HTML target accepted")
	}
	out, err := svc.beginHtmlSaveAt(req, target)
	if err != nil {
		t.Fatal(err)
	}
	svc.AbortHtmlSave(dto.AbortHtmlSaveRequest{Ticket: out.Ticket})
	if _, err = os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("target exists: %v", err)
	}
}

func TestHtmlStagingCleanupOnlyRemovesKnownOldStages(t *testing.T) {
	dir := t.TempDir()
	targetDir := t.TempDir()
	id := "0123456789abcdef0123456789abcdef"
	target := filepath.Join(targetDir, "file.md")
	stage := filepath.Join(targetDir, ".myd-html-stage-"+id)
	if err := os.Mkdir(stage, 0700); err != nil {
		t.Fatal(err)
	}
	published := filepath.Join(targetDir, "file.assets", "import-"+id)
	if err := os.MkdirAll(published, 0700); err != nil {
		t.Fatal(err)
	}
	journal := htmlStageJournal{ID: id, Target: target, Created: time.Now().Add(-25 * time.Hour).Unix()}
	b, _ := json.Marshal(journal)
	if err := os.WriteFile(filepath.Join(dir, id+".json"), b, 0600); err != nil {
		t.Fatal(err)
	}
	unknown := filepath.Join(targetDir, ".myd-html-stage-unknown")
	_ = os.Mkdir(unknown, 0700)
	htmlCleanupOldStaging(dir, time.Now())
	if _, err := os.Stat(stage); !os.IsNotExist(err) {
		t.Fatalf("stage remains: %v", err)
	}
	for _, p := range []string{published, unknown} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("removed unrelated directory %s: %v", p, err)
		}
	}
}
func TestHtmlStagingCleanupKeepsRecentOrMalformed(t *testing.T) {
	dir := t.TempDir()
	targetDir := t.TempDir()
	id := "0123456789abcdef0123456789abcdef"
	stage := filepath.Join(targetDir, ".myd-html-stage-"+id)
	_ = os.Mkdir(stage, 0700)
	journal := htmlStageJournal{ID: id, Target: filepath.Join(targetDir, "file.md"), Created: time.Now().Unix()}
	b, _ := json.Marshal(journal)
	p := filepath.Join(dir, id+".json")
	_ = os.WriteFile(p, b, 0600)
	htmlCleanupOldStaging(dir, time.Now())
	if _, err := os.Stat(stage); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(p, []byte("invalid"), 0600)
	htmlCleanupOldStaging(dir, time.Now().Add(48*time.Hour))
	if _, err := os.Stat(stage); err != nil {
		t.Fatal(err)
	}
}
func TestHtmlSaveRejectsOversizedImage(t *testing.T) {
	svc, req, target, image := htmlTestFixture(t)
	if err := os.Truncate(image, 20*1024*1024+1); err != nil {
		t.Fatal(err)
	}
	out, err := svc.beginHtmlSaveAt(req, target)
	if err != nil {
		t.Fatal(err)
	}
	defer svc.AbortHtmlSave(dto.AbortHtmlSaveRequest{Ticket: out.Ticket})
	if len(out.Rewrites) != 0 || len(out.Warnings) == 0 {
		t.Fatalf("rewrites=%v warnings=%v", out.Rewrites, out.Warnings)
	}
}

func TestHtmlSaveActivityTracksPrepareCommitAndAbort(t *testing.T) {
	svc, req, target, _ := htmlTestFixture(t)
	before := htmlSaveActivity.Load()
	prepared, err := svc.beginHtmlSaveAt(req, target)
	if err != nil {
		t.Fatal(err)
	}
	if htmlSaveActivity.Load() != before+1 || !HtmlSaveInProgress() {
		t.Fatal("prepared ticket must keep the close guard active")
	}
	if _, err := svc.AbortHtmlSave(dto.AbortHtmlSaveRequest{Ticket: prepared.Ticket}); err != nil {
		t.Fatal(err)
	}
	if htmlSaveActivity.Load() != before {
		t.Fatal("abort must release close guard")
	}
	prepared, err = svc.beginHtmlSaveAt(req, target)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := svc.CommitHtmlSave(dto.CommitHtmlSaveRequest{Ticket: prepared.Ticket, Markdown: "hello"})
	if err != nil || saved.Status != "saved" {
		t.Fatalf("commit: %#v %v", saved, err)
	}
	if htmlSaveActivity.Load() != before {
		t.Fatal("successful commit must release close guard")
	}
}
