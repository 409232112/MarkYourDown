package services

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"markyourdown/internal/assets"
	"markyourdown/internal/auth"
	"markyourdown/internal/dto"
	"markyourdown/internal/filesystem"
)

var (
	ErrFileTooLarge = errors.New("file exceeds maximum size of 20MB")
)

const (
	MaxDocumentBytes = 20 * 1024 * 1024 // 20MB limit per design doc
)

type selfWriteRecord struct {
	hash      string
	timestamp time.Time
}

// FileService handles document reading, saving, reloading, and image saving.
type FileService struct {
	mu             sync.Mutex
	docLocks       map[string]*sync.Mutex
	settingsSvc    *SettingsService
	backupSvc      *BackupService
	watcher        *filesystem.FileWatcher
	recentWrites   map[string]selfWriteRecord
	recentWritesMu sync.Mutex
}

// NewFileService creates a new FileService.
func NewFileService(settingsSvc *SettingsService, backupSvc *BackupService) *FileService {
	fs := &FileService{
		docLocks:     make(map[string]*sync.Mutex),
		settingsSvc:  settingsSvc,
		backupSvc:    backupSvc,
		recentWrites: make(map[string]selfWriteRecord),
	}

	w, err := filesystem.NewFileWatcher(func(e dto.FileChangeEvent) {
		if fs.isSelfWrite(e.Path) {
			return // Suppress echo from our own SaveFile
		}
		app := GetApp()
		if app != nil {
			app.Event.Emit("file:changed", e)
		}
	})
	if err == nil {
		fs.watcher = w
	}

	return fs
}

func (s *FileService) isSelfWrite(path string) bool {
	s.recentWritesMu.Lock()
	defer s.recentWritesMu.Unlock()

	norm, err := auth.NormalizePath(path)
	if err != nil {
		norm = filepath.Clean(path)
	}
	key := strings.ToLower(norm)
	rec, ok := s.recentWrites[key]
	if !ok {
		return false
	}
	if time.Since(rec.timestamp) < 1500*time.Millisecond {
		return true
	}
	delete(s.recentWrites, key)
	return false
}

func (s *FileService) recordSelfWrite(path, hash string) {
	s.recentWritesMu.Lock()
	defer s.recentWritesMu.Unlock()

	norm, err := auth.NormalizePath(path)
	if err != nil {
		norm = filepath.Clean(path)
	}
	key := strings.ToLower(norm)
	s.recentWrites[key] = selfWriteRecord{
		hash:      hash,
		timestamp: time.Now(),
	}
}

func (s *FileService) getDocLock(path string) *sync.Mutex {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := strings.ToLower(path)
	if l, ok := s.docLocks[key]; ok {
		return l
	}
	l := &sync.Mutex{}
	s.docLocks[key] = l
	return l
}

// OpenFileDialog presents a native file picker dialog and reads the selected document.
func (s *FileService) OpenFileDialog() (*dto.DocumentPayload, error) {
	app := GetApp()
	if app == nil {
		return nil, errors.New("application not initialized")
	}

	dialog := app.Dialog.OpenFile()
	dialog.AddFilter("Markdown 文档 (*.md;*.markdown;*.mdown;*.txt)", "*.md;*.markdown;*.mdown;*.txt")
	dialog.AddFilter("所有文件 (*.*)", "*.*")

	chosenPath, err := dialog.PromptForSingleSelection()
	if err != nil {
		return nil, err
	}
	if chosenPath == "" {
		return nil, nil // user cancelled
	}

	return s.openSelectedFile(chosenPath)
}

// Only paths returned by the native file picker may be authorized here.
func (s *FileService) openSelectedFile(chosenPath string) (*dto.DocumentPayload, error) {
	path, err := auth.Default().AuthorizeFile(chosenPath)
	if err != nil {
		return nil, err
	}
	return s.OpenFileByPath(path)
}

// OpenFileByPath validates and reads a file directly from a given path (must be pre-authorized via dialog, drag-and-drop, CLI, or session).
func (s *FileService) OpenFileByPath(filePath string) (*dto.DocumentPayload, error) {
	normPath, err := auth.NormalizePath(filePath)
	if err != nil {
		return nil, fmt.Errorf("invalid file path: %w", err)
	}

	validPath, err := auth.Default().ValidateFileRead(normPath)
	if err != nil {
		return nil, fmt.Errorf("unauthorized file read: %w", err)
	}

	stat, err := os.Stat(validPath)
	if err != nil {
		return nil, err
	}
	if stat.IsDir() {
		return nil, fmt.Errorf("path is a directory: %s", validPath)
	}
	if stat.Size() > MaxDocumentBytes {
		return nil, ErrFileTooLarge
	}

	rawBytes, err := os.ReadFile(validPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	decoded, err := filesystem.DecodeFileContent(rawBytes)
	if err != nil {
		return nil, err
	}

	// Watch the file's parent directory
	if s.watcher != nil {
		_ = s.watcher.WatchFile(validPath)
	}

	// Register in recent files
	title := filepath.Base(validPath)
	_ = s.settingsSvc.AddRecentFile(validPath, title)

	// Generate doc ID
	randBytes := make([]byte, 8)
	_, _ = rand.Read(randBytes)
	docID := hex.EncodeToString(randBytes)

	return &dto.DocumentPayload{
		ID:        docID,
		Path:      validPath,
		Title:     title,
		Content:   decoded.Text,
		EOL:       decoded.EOL,
		Encoding:  decoded.Encoding,
		IsUnsaved: false,
		Disk: dto.DiskFingerprint{
			MtimeMs: stat.ModTime().UnixMilli(),
			Size:    stat.Size(),
			Hash:    decoded.Hash,
		},
	}, nil
}

// SaveFile atomically writes the document to disk, checking for conflicts unless force is set.
func (s *FileService) SaveFile(req dto.SaveFileRequest) (*dto.SaveFileResponse, error) {
	if req.Path == "" {
		return s.SaveFileAs(req)
	}

	validPath, err := auth.Default().ValidateFileWrite(req.Path)
	if err != nil {
		return nil, err
	}

	docLock := s.getDocLock(validPath)
	docLock.Lock()
	defer docLock.Unlock()

	// External modification check before writing
	if !req.Force {
		stat, err := os.Stat(validPath)
		if err == nil {
			// Compare mtime & size
			rawDiskBytes, err := os.ReadFile(validPath)
			if err == nil {
				currentDiskHash := filesystem.ComputeHash(rawDiskBytes)
				if req.ExpectedDiskHash != "" && currentDiskHash != req.ExpectedDiskHash {
					// External conflict detected!
					return &dto.SaveFileResponse{
						DocumentID: req.DocumentID,
						Path:       validPath,
						Revision:   req.Revision,
						Status:     "conflict",
						Disk: dto.DiskFingerprint{
							MtimeMs: stat.ModTime().UnixMilli(),
							Size:    stat.Size(),
							Hash:    currentDiskHash,
						},
						Error: "文件已在外部被修改",
					}, nil
				}
			}
		}
	}

	// Determine encoding and EOL
	encoding := req.Encoding
	if encoding == "" {
		encoding = "utf8"
	}
	eol := req.EOL
	if eol == "" {
		eol = "crlf"
	}

	encodedBytes, err := filesystem.EncodeFileContent(req.Content, encoding, eol)
	if err != nil {
		return nil, fmt.Errorf("encoding failed: %w", err)
	}

	newHash := filesystem.ComputeHash(encodedBytes)

	// If force overwrite, preserve existing disk copy in overwritten backups
	if req.Force {
		if existingBytes, readErr := os.ReadFile(validPath); readErr == nil && len(existingBytes) > 0 {
			_ = s.backupSvc.SaveOverwritten(validPath, string(existingBytes))
		}
	}

	// Register self-write BEFORE writing to avoid race with fsnotify
	s.recordSelfWrite(validPath, newHash)

	// Write atomically
	if err := filesystem.WriteFileAtomic(validPath, encodedBytes); err != nil {
		return &dto.SaveFileResponse{
			DocumentID: req.DocumentID,
			Path:       validPath,
			Revision:   req.Revision,
			Status:     "saveFailed",
			Error:      err.Error(),
		}, nil
	}

	// Refresh stat
	stat, _ := os.Stat(validPath)
	var mtime int64
	var size int64
	if stat != nil {
		mtime = stat.ModTime().UnixMilli()
		size = stat.Size()
	}

	// Remove pending backup since save succeeded
	_ = s.backupSvc.RemoveBackup(req.DocumentID)

	// Register in recent files
	_ = s.settingsSvc.AddRecentFile(validPath, filepath.Base(validPath))

	return &dto.SaveFileResponse{
		DocumentID: req.DocumentID,
		Path:       validPath,
		Revision:   req.Revision,
		Status:     "clean",
		Disk: dto.DiskFingerprint{
			MtimeMs: mtime,
			Size:    size,
			Hash:    newHash,
		},
	}, nil
}

// SaveFileAs prompts the user for a new file location and saves the document.
func (s *FileService) SaveFileAs(req dto.SaveFileRequest) (*dto.SaveFileResponse, error) {
	app := GetApp()
	if app == nil {
		return nil, errors.New("application not initialized")
	}

	chosenPath, err := promptDocumentSavePath(app, req.Path)
	if err != nil {
		return nil, err
	}
	if chosenPath == "" {
		return nil, nil // user cancelled
	}

	// Ensure .md extension if none
	if filepath.Ext(chosenPath) == "" {
		chosenPath = chosenPath + ".md"
	}

	// Authorize newly selected path
	norm, err := auth.Default().AuthorizeFile(chosenPath)
	if err != nil {
		return nil, err
	}

	req.Path = norm
	req.Force = true // newly chosen destination
	return s.SaveFile(req)
}

// CheckExternalChange checks if the file was modified on disk outside the application.
func (s *FileService) CheckExternalChange(docID, path, knownHash string, knownMtime, knownSize int64) (*dto.FileStatusResponse, error) {
	stat, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &dto.FileStatusResponse{
				DocumentID: docID,
				Path:       path,
				Status:     "deleted",
			}, nil
		}
		return nil, err
	}

	mtimeMs := stat.ModTime().UnixMilli()
	size := stat.Size()

	// Fast path: mtime and size identical
	if mtimeMs == knownMtime && size == knownSize {
		return &dto.FileStatusResponse{
			DocumentID: docID,
			Path:       path,
			Status:     "clean",
			Disk: dto.DiskFingerprint{
				MtimeMs: mtimeMs,
				Size:    size,
				Hash:    knownHash,
			},
		}, nil
	}

	// Mtime or size changed: read and calculate sha1
	rawBytes, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	currentHash := filesystem.ComputeHash(rawBytes)

	if currentHash == knownHash {
		// Touch-only, content identical
		return &dto.FileStatusResponse{
			DocumentID: docID,
			Path:       path,
			Status:     "clean",
			Disk: dto.DiskFingerprint{
				MtimeMs: mtimeMs,
				Size:    size,
				Hash:    currentHash,
			},
		}, nil
	}

	// External conflict!
	return &dto.FileStatusResponse{
		DocumentID: docID,
		Path:       path,
		Status:     "conflict",
		Disk: dto.DiskFingerprint{
			MtimeMs: mtimeMs,
			Size:    size,
			Hash:    currentHash,
		},
	}, nil
}

// ReloadFile discards local edits and reloads the document content from disk.
func (s *FileService) ReloadFile(docID, filePath string) (*dto.DocumentPayload, error) {
	validPath, err := auth.Default().ValidateFileRead(filePath)
	if err != nil {
		return nil, err
	}

	stat, err := os.Stat(validPath)
	if err != nil {
		return nil, err
	}

	rawBytes, err := os.ReadFile(validPath)
	if err != nil {
		return nil, err
	}

	decoded, err := filesystem.DecodeFileContent(rawBytes)
	if err != nil {
		return nil, err
	}

	return &dto.DocumentPayload{
		ID:        docID,
		Path:      validPath,
		Title:     filepath.Base(validPath),
		Content:   decoded.Text,
		EOL:       decoded.EOL,
		Encoding:  decoded.Encoding,
		IsUnsaved: false,
		Disk: dto.DiskFingerprint{
			MtimeMs: stat.ModTime().UnixMilli(),
			Size:    stat.Size(),
			Hash:    decoded.Hash,
		},
	}, nil
}

// SaveImage saves a pasted or dropped image to the document's assets directory.
func (s *FileService) SaveImage(req dto.SaveImageRequest) (*dto.SaveImageResponse, error) {
	data, err := base64.StdEncoding.DecodeString(req.ImageData)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 image data: %w", err)
	}

	if len(data) > assets.MaxImageBytes {
		return nil, assets.ErrImageTooLarge
	}

	_, ext, err := assets.DetectImageMimeAndExt(data)
	if err != nil {
		return nil, fmt.Errorf("unsupported or invalid image format: %w", err)
	}

	var targetDir string
	var relDir string = "assets"
	var dummyDocPath string

	if req.DocPath != "" {
		normDoc, err := auth.NormalizePath(req.DocPath)
		if err != nil {
			return nil, err
		}
		validDoc, err := auth.Default().ValidateFileRead(normDoc)
		if err != nil {
			return nil, fmt.Errorf("unauthorized document path for saving image: %w", err)
		}

		docDir := filepath.Dir(validDoc)
		configuredDir := "assets"
		if s.settingsSvc != nil {
			if st, sErr := s.settingsSvc.GetSettings(); sErr == nil && st != nil {
				if st.ImageDir == "docAssets" {
					baseName := filepath.Base(validDoc)
					ext := filepath.Ext(baseName)
					docNameWithoutExt := strings.TrimSuffix(baseName, ext)
					configuredDir = docNameWithoutExt + ".assets"
				} else if st.ImageDir != "" && st.ImageDir != "sub" {
					configuredDir = st.ImageDir
				}
			}
		}

		cleanConfigured := filepath.Clean(configuredDir)
		if filepath.IsAbs(cleanConfigured) || strings.HasPrefix(cleanConfigured, "..") || cleanConfigured == "." {
			cleanConfigured = "assets"
		}

		targetDir = filepath.Join(docDir, cleanConfigured)
		relCheck, rErr := filepath.Rel(strings.ToLower(docDir), strings.ToLower(targetDir))
		if rErr != nil || strings.HasPrefix(relCheck, "..") {
			targetDir = filepath.Join(docDir, "assets")
			cleanConfigured = "assets"
		}
		relDir = cleanConfigured
		dummyDocPath = validDoc
	} else {
		// Temporary assets directory for untitled document
		userDir, err := GetUserDataDir()
		if err != nil {
			return nil, err
		}
		targetDir = filepath.Join(userDir, "temp_assets")
		dummyDocPath = filepath.Join(targetDir, "untitled.md")
	}

	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, err
	}

	// Always generate server-side safe timestamp and random hex filename with detected extension
	timestamp := time.Now().Format("20060102-150405")
	randBytes := make([]byte, 4)
	_, _ = rand.Read(randBytes)
	filename := fmt.Sprintf("%s-%s%s", timestamp, hex.EncodeToString(randBytes), ext)

	targetFilePath := filepath.Join(targetDir, filename)
	if err := filesystem.WriteFileAtomic(targetFilePath, data); err != nil {
		return nil, fmt.Errorf("failed to write image: %w", err)
	}

	// Register image token
	_, tokenURL, err := assets.DefaultRegistry().GenerateToken(dummyDocPath, targetFilePath)
	if err != nil {
		return nil, err
	}

	relPath := fmt.Sprintf("./%s/%s", filepath.ToSlash(relDir), filename)
	return &dto.SaveImageResponse{
		RelativePath: relPath,
		TokenURL:     tokenURL,
	}, nil
}

// GetImageToken generates an opaque token URL for a relative image path.
func (s *FileService) GetImageToken(docPath, imgPath string) (string, error) {
	_, tokenURL, err := assets.DefaultRegistry().GenerateToken(docPath, imgPath)
	return tokenURL, err
}

// ReadImageAsDataURL reads a local image referenced by docPath and returns a data: URL.
func (s *FileService) ReadImageAsDataURL(docPath, imgPath string) (string, error) {
	var fullTarget string
	if filepath.IsAbs(imgPath) {
		fullTarget = imgPath
	} else if docPath != "" {
		normDoc, err := auth.NormalizePath(docPath)
		if err == nil {
			fullTarget = filepath.Join(filepath.Dir(normDoc), imgPath)
		} else {
			fullTarget = imgPath
		}
	} else {
		fullTarget = imgPath
	}

	normImg, err := auth.NormalizePath(fullTarget)
	if err != nil {
		return "", fmt.Errorf("invalid image path: %w", err)
	}

	imgExt := strings.ToLower(filepath.Ext(normImg))
	mimeType, allowed := assets.AllowedImageExtensions[imgExt]
	if !allowed {
		return "", assets.ErrUnsupportedImageExt
	}

	stat, err := os.Stat(normImg)
	if err != nil {
		return "", err
	}
	if stat.Size() > assets.MaxImageBytes {
		return "", assets.ErrImageTooLarge
	}

	data, err := os.ReadFile(normImg)
	if err != nil {
		return "", err
	}

	b64 := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, b64), nil
}

// CloseFile cleans up resources when a document is closed.
func (s *FileService) CloseFile(docID string) {
	_ = s.backupSvc.RemoveBackup(docID)
}
