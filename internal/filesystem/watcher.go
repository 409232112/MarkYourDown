package filesystem

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"markyourdown/internal/dto"
)

// FileWatcher watches files and directories with fsnotify and 200ms debounce.
type FileWatcher struct {
	watcher    *fsnotify.Watcher
	mu         sync.Mutex
	closed     bool
	callback   func(event dto.FileChangeEvent)
	debounceMu sync.Mutex
	timers     map[string]*time.Timer
	watched    map[string]bool
}

// NewFileWatcher creates a new debounced filesystem watcher.
func NewFileWatcher(callback func(event dto.FileChangeEvent)) (*FileWatcher, error) {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	fw := &FileWatcher{
		watcher:  w,
		callback: callback,
		timers:   make(map[string]*time.Timer),
		watched:  make(map[string]bool),
	}

	go fw.loop()
	return fw, nil
}

// WatchFile watches the parent directory of a file to reliably catch atomic replacements.
func (fw *FileWatcher) WatchFile(filePath string) error {
	dir := filepath.Dir(filePath)
	return fw.WatchDir(dir, false)
}

// WatchDir watches a directory. If recursive is true, it recursively walks and adds all subdirectories.
func (fw *FileWatcher) WatchDir(dir string, recursive bool) error {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	if fw.closed {
		return nil
	}

	if !recursive {
		if !fw.watched[dir] {
			if err := fw.watcher.Add(dir); err != nil {
				return err
			}
			fw.watched[dir] = true
		}
		return nil
	}

	// Recursive walk
	return filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			base := info.Name()
			if shouldIgnoreDir(base) && path != dir {
				return filepath.SkipDir
			}
			if !fw.watched[path] {
				if addErr := fw.watcher.Add(path); addErr == nil {
					fw.watched[path] = true
				}
			}
		}
		return nil
	})
}

// Unwatch removes a directory from watching.
func (fw *FileWatcher) Unwatch(dir string) error {
	fw.mu.Lock()
	defer fw.mu.Unlock()

	delete(fw.watched, dir)
	return fw.watcher.Remove(dir)
}

// Close stops the watcher.
func (fw *FileWatcher) Close() error {
	fw.mu.Lock()
	fw.closed = true
	fw.mu.Unlock()

	return fw.watcher.Close()
}

func shouldIgnoreDir(name string) bool {
	if name == "node_modules" || name == ".git" {
		return true
	}
	if strings.HasPrefix(name, ".") && name != "." && name != ".." {
		return true
	}
	return false
}

func (fw *FileWatcher) loop() {
	for {
		select {
		case event, ok := <-fw.watcher.Events:
			if !ok {
				return
			}
			fw.handleFsEvent(event)
		case _, ok := <-fw.watcher.Errors:
			if !ok {
				return
			}
		}
	}
}

func (fw *FileWatcher) handleFsEvent(event fsnotify.Event) {
	base := filepath.Base(event.Name)
	// Ignore temporary files and ignored directories
	if strings.HasPrefix(base, ".myd-") || shouldIgnoreDir(base) {
		return
	}

	// If a new directory was created, add it to watcher
	if event.Has(fsnotify.Create) {
		if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
			if !shouldIgnoreDir(base) {
				_ = fw.WatchDir(event.Name, true)
			}
		}
	}

	// Determine event type
	var eventType string
	if event.Has(fsnotify.Write) {
		eventType = "write"
	} else if event.Has(fsnotify.Create) {
		eventType = "create"
	} else if event.Has(fsnotify.Remove) {
		eventType = "remove"
	} else if event.Has(fsnotify.Rename) {
		eventType = "rename"
	} else {
		return
	}

	fw.debounce(event.Name, eventType)
}

func (fw *FileWatcher) debounce(path, eventType string) {
	fw.debounceMu.Lock()
	defer fw.debounceMu.Unlock()

	key := path + ":" + eventType
	if timer, ok := fw.timers[key]; ok {
		timer.Stop()
	}

	fw.timers[key] = time.AfterFunc(200*time.Millisecond, func() {
		fw.debounceMu.Lock()
		delete(fw.timers, key)
		fw.debounceMu.Unlock()

		if fw.callback != nil {
			fw.callback(dto.FileChangeEvent{
				Type: eventType,
				Path: path,
			})
		}
	})
}
