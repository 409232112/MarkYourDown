package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"markyourdown/internal/auth"
	"markyourdown/internal/dto"
	"markyourdown/internal/filesystem"
)

type htmlSaveTicket struct {
	target, staging, assets string
	targetDisk              *dto.DiskFingerprint
	sources                 map[string]dto.DiskFingerprint
	expires                 time.Time
	committed               bool
	active                  bool
}

// htmlSaveActivity is lock-free so a native close hook never waits on an
// in-flight commit or a modal dialog running on the UI thread.
var htmlSaveActivity atomic.Int64

func HtmlSaveInProgress() bool { return htmlSaveActivity.Load() > 0 }

func htmlReleaseTicket(t *htmlSaveTicket) {
	if t.active {
		t.active = false
		htmlSaveActivity.Add(-1)
	}
}

var htmlSaves = struct {
	sync.Mutex
	tickets map[string]*htmlSaveTicket
}{tickets: map[string]*htmlSaveTicket{}}

func htmlFingerprint(path string) (*dto.DiskFingerprint, error) {
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	return &dto.DiskFingerprint{Hash: filesystem.ComputeHash(b), MtimeMs: st.ModTime().UnixMilli(), Size: st.Size()}, nil
}
func htmlSameFingerprint(a, b *dto.DiskFingerprint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Hash == b.Hash && a.MtimeMs == b.MtimeMs && a.Size == b.Size
}
func htmlRandom() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
func htmlLocalPath(raw string) (string, error) {
	u, e := url.Parse(raw)
	if e != nil || !strings.EqualFold(u.Scheme, "file") {
		return "", errors.New("not a file URL")
	}
	p := u.Path
	if u.Host != "" && u.Host != "localhost" {
		p = "//" + u.Host + p
	}
	if runtime.GOOS == "windows" && len(p) >= 3 && p[0] == '/' && p[2] == ':' {
		p = p[1:]
	}
	return filepath.FromSlash(p), nil
}
func htmlRelativeURL(path string) string {
	u := url.URL{Path: filepath.ToSlash(path)}
	return u.EscapedPath()
}
func htmlImageBytes(raw string) ([]byte, string, error) {
	const maxImageBytes = 20 * 1024 * 1024
	if strings.HasPrefix(strings.ToLower(raw), "data:") {
		i := strings.IndexByte(raw, ',')
		if i < 0 {
			return nil, "", errors.New("invalid data URL")
		}
		meta := raw[5:i]
		// A conservative encoded-length bound avoids allocating an enormous decode buffer.
		if len(raw)-i-1 > maxImageBytes*3 {
			return nil, "", errors.New("图片超过 20 MiB 限制")
		}
		var b []byte
		var err error
		if strings.HasSuffix(strings.ToLower(meta), ";base64") {
			if base64.StdEncoding.DecodedLen(len(raw)-i-1) > maxImageBytes+2 {
				return nil, "", errors.New("图片超过 20 MiB 限制")
			}
			b, err = base64.StdEncoding.DecodeString(raw[i+1:])
		} else {
			decodedLen := 0
			for p := i + 1; p < len(raw); p++ {
				if raw[p] == '%' && p+2 < len(raw) {
					p += 2
				}
				decodedLen++
				if decodedLen > maxImageBytes {
					return nil, "", errors.New("图片超过 20 MiB 限制")
				}
			}
			var s string
			s, err = url.PathUnescape(raw[i+1:])
			b = []byte(s)
		}
		if len(b) > maxImageBytes {
			return nil, "", errors.New("图片超过 20 MiB 限制")
		}
		return b, "", err
	}
	p, err := htmlLocalPath(raw)
	if err != nil {
		return nil, "", err
	}
	st, err := os.Stat(p)
	if err != nil {
		return nil, "", err
	}
	if st.Size() > maxImageBytes {
		return nil, "", errors.New("图片超过 20 MiB 限制")
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, maxImageBytes+1))
	if len(b) > maxImageBytes {
		return nil, "", errors.New("图片超过 20 MiB 限制")
	}
	return b, p, err
}
func htmlImageExt(b []byte) string {
	switch http.DetectContentType(b) {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	}
	return ""
}

func (s *FileService) BeginHtmlSave(req dto.BeginHtmlSaveRequest) (*dto.BeginHtmlSaveResponse, error) {
	htmlSaveActivity.Add(1)
	defer htmlSaveActivity.Add(-1)
	app := GetApp()
	if app == nil {
		return nil, errors.New("application not initialized")
	}
	suggested := filepath.Join(filepath.Dir(req.SourcePath), req.SuggestedName)
	target, err := promptDocumentSavePath(app, suggested)
	if err != nil {
		return nil, err
	}
	if target == "" {
		return &dto.BeginHtmlSaveResponse{Status: "cancelled"}, nil
	}
	return s.beginHtmlSaveAt(req, target)
}
func (s *FileService) beginHtmlSaveAt(req dto.BeginHtmlSaveRequest, target string) (*dto.BeginHtmlSaveResponse, error) {
	htmlSaveActivity.Add(1)
	retained := false
	defer func() {
		if !retained {
			htmlSaveActivity.Add(-1)
		}
	}()
	// Only remove staging directories tracked by this process; published assets are
	// never removed merely because a ticket has expired.
	htmlSaves.Lock()
	for id, old := range htmlSaves.tickets {
		if time.Now().After(old.expires) {
			if !old.committed {
				_ = os.RemoveAll(old.staging)
			}
			htmlReleaseTicket(old)
			htmlRemoveJournal(id)
			delete(htmlSaves.tickets, id)
		}
	}
	htmlSaves.Unlock()
	if filepath.Ext(target) == "" {
		target += ".md"
	}
	if !strings.EqualFold(filepath.Ext(target), ".md") {
		return nil, errors.New("请选择 .md 文件")
	}
	target, err := filepath.Abs(target)
	if err != nil {
		return nil, err
	}
	source, err := filepath.Abs(req.SourcePath)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(filepath.Clean(target), filepath.Clean(source)) {
		return nil, errors.New("不能覆盖源 HTML")
	}
	a, ae := os.Stat(source)
	b, be := os.Stat(target)
	if ae == nil && be == nil && os.SameFile(a, b) {
		return nil, errors.New("不能覆盖源 HTML")
	}
	target, err = auth.Default().AuthorizeFile(target)
	if err != nil {
		return nil, err
	}
	fp, err := htmlFingerprint(target)
	if err != nil {
		return nil, err
	}
	id, err := htmlRandom()
	if err != nil {
		return nil, err
	}
	dir := filepath.Dir(target)
	stage := filepath.Join(dir, ".myd-html-stage-"+id)
	if err = os.Mkdir(stage, 0700); err != nil {
		return nil, err
	}
	done := false
	defer func() {
		if !done {
			_ = os.RemoveAll(stage)
			htmlRemoveJournal(id)
		}
	}()
	if err = htmlWriteJournal(id, target); err != nil {
		return nil, err
	}
	assetRel := filepath.Join(strings.TrimSuffix(filepath.Base(target), filepath.Ext(target))+".assets", "import-"+id)
	assets := filepath.Join(dir, assetRel)
	ticket := &htmlSaveTicket{target: target, staging: stage, assets: assets, targetDisk: fp, sources: map[string]dto.DiskFingerprint{}, expires: time.Now().Add(10 * time.Minute), active: true}
	out := &dto.BeginHtmlSaveResponse{Status: "ready", Ticket: id, TargetPath: target, ExpiresAt: ticket.expires.UnixMilli()}
	dedup := map[string]string{}
	totalImageBytes := 0
	for _, ref := range req.References {
		if ref.Kind == "image" && (strings.HasPrefix(strings.ToLower(ref.Resolved), "file:") || strings.HasPrefix(strings.ToLower(ref.Resolved), "data:")) {
			data, path, e := htmlImageBytes(ref.Resolved)
			if e != nil {
				out.Warnings = append(out.Warnings, "图片无法读取："+ref.Original+"（"+e.Error()+"）")
				continue
			}
			ext := htmlImageExt(data)
			if ext == "" {
				out.Warnings = append(out.Warnings, "图片格式不支持复制："+ref.Original)
				continue
			}
			if path != "" {
				f, e := htmlFingerprint(path)
				if e != nil || f == nil {
					out.Warnings = append(out.Warnings, "图片无法读取："+ref.Original)
					continue
				}
				if f.Hash != filesystem.ComputeHash(data) {
					return nil, errors.New("图片读取时发生变化，请重试")
				}
				ticket.sources[path] = *f
			}
			sum := sha256.Sum256(data)
			hash := hex.EncodeToString(sum[:])
			name, ok := dedup[hash]
			if !ok {
				if totalImageBytes+len(data) > 100*1024*1024 {
					out.Warnings = append(out.Warnings, "图片总量超过 100 MiB，保留原引用："+ref.Original)
					continue
				}
				totalImageBytes += len(data)
				name = hash + ext
				if err = os.WriteFile(filepath.Join(stage, name), data, 0644); err != nil {
					return nil, err
				}
				dedup[hash] = name
			}
			out.Rewrites = append(out.Rewrites, dto.HtmlRewrite{ReferenceID: ref.ID, From: ref.Resolved, To: htmlRelativeURL(filepath.Join(assetRel, name))})
		} else if ref.Kind == "link" && strings.HasPrefix(strings.ToLower(ref.Resolved), "file:") {
			p, e := htmlLocalPath(ref.Resolved)
			if e == nil {
				rel, e := filepath.Rel(dir, p)
				if e == nil {
					u, _ := url.Parse(ref.Resolved)
					next := htmlRelativeURL(rel)
					if u.RawQuery != "" {
						next += "?" + u.RawQuery
					}
					if u.Fragment != "" {
						next += "#" + url.PathEscape(u.Fragment)
					}
					out.Rewrites = append(out.Rewrites, dto.HtmlRewrite{ReferenceID: ref.ID, From: ref.Resolved, To: next})
				}
			}
		}
	}
	htmlSaves.Lock()
	htmlSaves.tickets[id] = ticket
	retained = true
	htmlSaves.Unlock()
	time.AfterFunc(time.Until(ticket.expires), func() {
		htmlSaves.Lock()
		defer htmlSaves.Unlock()
		if current := htmlSaves.tickets[id]; current == ticket && !current.committed {
			_ = os.RemoveAll(current.staging)
			htmlRemoveJournal(id)
			htmlReleaseTicket(current)
			delete(htmlSaves.tickets, id)
		}
	})
	done = true
	return out, nil
}
func (s *FileService) CommitHtmlSave(req dto.CommitHtmlSaveRequest) (*dto.CommitHtmlSaveResponse, error) {
	htmlSaves.Lock()
	defer htmlSaves.Unlock()
	t := htmlSaves.tickets[req.Ticket]
	fail := func(code, msg string) *dto.CommitHtmlSaveResponse {
		return &dto.CommitHtmlSaveResponse{Status: "failed", Code: code, Message: msg}
	}
	if t == nil {
		return fail("INVALID_TICKET", "保存会话不存在"), nil
	}
	if t.committed {
		return fail("ALREADY_COMMITTED", "已保存"), nil
	}
	if time.Now().After(t.expires) {
		return fail("SAVE_TICKET_EXPIRED", "保存会话已过期"), nil
	}
	lock := s.getDocLock(t.target)
	lock.Lock()
	defer lock.Unlock()
	cur, err := htmlFingerprint(t.target)
	if err != nil {
		return fail("READ_FAILED", err.Error()), nil
	}
	if !htmlSameFingerprint(cur, t.targetDisk) {
		return fail("TARGET_CHANGED", "目标文件已变化，请重新保存"), nil
	}
	for p, fp := range t.sources {
		cur, err = htmlFingerprint(p)
		if err != nil || !htmlSameFingerprint(cur, &fp) {
			return fail("ASSET_CHANGED", "图片已变化，请重新保存"), nil
		}
	}
	entries, err := os.ReadDir(t.staging)
	if err != nil {
		return fail("WRITE_FAILED", err.Error()), nil
	}
	published := false
	if len(entries) > 0 {
		if err = os.MkdirAll(filepath.Dir(t.assets), 0755); err == nil {
			err = os.Rename(t.staging, t.assets)
		}
		if err != nil {
			return fail("WRITE_FAILED", err.Error()), nil
		}
		published = true
	}
	content := strings.ReplaceAll(strings.ReplaceAll(req.Markdown, "\r\n", "\n"), "\r", "\n")
	if req.EOL == "crlf" {
		content = strings.ReplaceAll(content, "\n", "\r\n")
	}
	if err = filesystem.WriteFileAtomic(t.target, []byte(content)); err != nil {
		if published {
			_ = os.RemoveAll(t.assets)
		}
		return fail("WRITE_FAILED", err.Error()), nil
	}
	t.committed = true
	htmlReleaseTicket(t)
	_ = os.RemoveAll(t.staging)
	htmlRemoveJournal(req.Ticket)
	// Once the atomic write succeeds, always report success. A later metadata
	// read failure must not make the caller retry a committed transaction.
	disk := &dto.DiskFingerprint{Hash: filesystem.ComputeHash([]byte(content)), Size: int64(len([]byte(content)))}
	if st, statErr := os.Stat(t.target); statErr == nil {
		disk.MtimeMs = st.ModTime().UnixMilli()
		disk.Size = st.Size()
	}
	s.recordSelfWrite(t.target, disk.Hash)
	if s.watcher != nil {
		_ = s.watcher.WatchFile(t.target)
	}
	if s.settingsSvc != nil {
		_ = s.settingsSvc.AddRecentFile(t.target, filepath.Base(t.target))
	}
	return &dto.CommitHtmlSaveResponse{Status: "saved", Path: t.target, Disk: *disk, Encoding: "utf8"}, nil
}
func (s *FileService) AbortHtmlSave(req dto.AbortHtmlSaveRequest) (*dto.AbortHtmlSaveResponse, error) {
	htmlSaves.Lock()
	defer htmlSaves.Unlock()
	t := htmlSaves.tickets[req.Ticket]
	if t == nil {
		return &dto.AbortHtmlSaveResponse{Status: "aborted"}, nil
	}
	if t.committed {
		return &dto.AbortHtmlSaveResponse{Status: "committed"}, nil
	}
	_ = os.RemoveAll(t.staging)
	htmlRemoveJournal(req.Ticket)
	htmlReleaseTicket(t)
	delete(htmlSaves.tickets, req.Ticket)
	return &dto.AbortHtmlSaveResponse{Status: "aborted"}, nil
}
