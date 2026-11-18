package services

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// A journal identifies only a staging directory. Published assets are never
// journal targets, even if the process exits between publication and commit.
type htmlStageJournal struct {
	ID      string `json:"id"`
	Target  string `json:"target"`
	Created int64  `json:"created"`
}

func htmlJournalDir() (string, error) {
	dir, err := GetUserDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "html-import-staging"), nil
}
func htmlJournalPath(id string) (string, error) {
	dir, err := htmlJournalDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, id+".json"), nil
}
func htmlWriteJournal(id, target string) error {
	path, err := htmlJournalPath(id)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.Marshal(htmlStageJournal{ID: id, Target: target, Created: time.Now().Unix()})
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}
func htmlRemoveJournal(id string) {
	path, err := htmlJournalPath(id)
	if err == nil {
		_ = os.Remove(path)
	}
}
func htmlCleanupOldStaging(dir string, now time.Time) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".json")
		if len(id) != 32 {
			continue
		}
		if _, err := hex.DecodeString(id); err != nil {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var j htmlStageJournal
		if json.Unmarshal(data, &j) != nil || j.ID != id || !filepath.IsAbs(j.Target) || j.Created <= 0 || now.Sub(time.Unix(j.Created, 0)) < 24*time.Hour {
			continue
		}
		stage := filepath.Join(filepath.Dir(j.Target), ".myd-html-stage-"+id)
		st, err := os.Lstat(stage)
		if os.IsNotExist(err) {
			_ = os.Remove(path)
			continue
		}
		if err != nil || !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			continue
		}
		if os.RemoveAll(stage) == nil {
			_ = os.Remove(path)
		}
	}
}
func htmlCleanupOnStartup() {
	dir, err := htmlJournalDir()
	if err == nil {
		htmlCleanupOldStaging(dir, time.Now())
	}
}
