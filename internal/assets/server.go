package assets

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"markyourdown/internal/auth"
)

var (
	ErrImageNotFound       = errors.New("image not found")
	ErrImageTooLarge       = errors.New("image exceeds 50MB limit")
	ErrUnsupportedImageExt = errors.New("unsupported image format")
	ErrImageOutOfBounds    = errors.New("image path is outside document bounds")
	ErrInvalidImageMagic   = errors.New("unrecognized or invalid image data format")
)

// DetectImageMimeAndExt detects image format based on header magic bytes.
func DetectImageMimeAndExt(data []byte) (string, string, error) {
	if len(data) < 4 {
		return "", "", ErrInvalidImageMagic
	}
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if len(data) >= 8 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 &&
		data[4] == 0x0D && data[5] == 0x0A && data[6] == 0x1A && data[7] == 0x0A {
		return "image/png", ".png", nil
	}
	// JPEG: FF D8 FF
	if data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return "image/jpeg", ".jpg", nil
	}
	// GIF: GIF87a or GIF89a
	if len(data) >= 6 && string(data[0:4]) == "GIF8" && (data[4] == '7' || data[4] == '9') && data[5] == 'a' {
		return "image/gif", ".gif", nil
	}
	// WebP: RIFF....WEBP
	if len(data) >= 12 && string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "image/webp", ".webp", nil
	}
	// BMP: 42 4D
	if data[0] == 0x42 && data[1] == 0x4D {
		return "image/bmp", ".bmp", nil
	}
	// SVG: text based, check first 1KB
	maxScan := len(data)
	if maxScan > 1024 {
		maxScan = 1024
	}
	trimmed := strings.TrimSpace(string(data[:maxScan]))
	if strings.HasPrefix(trimmed, "<svg") || (strings.HasPrefix(trimmed, "<?xml") && strings.Contains(trimmed, "<svg")) {
		return "image/svg+xml", ".svg", nil
	}
	return "", "", ErrInvalidImageMagic
}

const (
	MaxImageBytes = 50 * 1024 * 1024 // 50MB
)

var allowedImageExtensions = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".bmp":  "image/bmp",
	".ico":  "image/x-icon",
	".avif": "image/avif",
	".svg":  "image/svg+xml",
}

// AllowedImageExtensions is the exported mapping of supported image extensions to MIME types.
var AllowedImageExtensions = allowedImageExtensions

// ImageTokenEntry records metadata for an authorized image token.
type ImageTokenEntry struct {
	Token     string
	DocPath   string
	RealPath  string
	MimeType  string
	CreatedAt time.Time
}

// Registry manages in-memory opaque tokens for local images.
type Registry struct {
	mu     sync.RWMutex
	tokens map[string]*ImageTokenEntry
}

var (
	defaultRegistry *Registry
	regOnce         sync.Once
)

// DefaultRegistry returns the singleton image token registry.
func DefaultRegistry() *Registry {
	regOnce.Do(func() {
		defaultRegistry = &Registry{
			tokens: make(map[string]*ImageTokenEntry),
		}
	})
	return defaultRegistry
}

// GenerateToken creates an opaque random token for an image referenced by docPath.
func (r *Registry) GenerateToken(docPath, imgPath string) (string, string, error) {
	normDoc, err := auth.NormalizePath(docPath)
	if err != nil {
		return "", "", fmt.Errorf("invalid document path: %w", err)
	}

	docDir := filepath.Dir(normDoc)
	docBase := filepath.Base(normDoc)
	ext := filepath.Ext(docBase)
	docNameWithoutExt := strings.TrimSuffix(docBase, ext)

	// Resolve target image path
	var fullTarget string
	if filepath.IsAbs(imgPath) {
		fullTarget = imgPath
	} else {
		fullTarget = filepath.Join(docDir, imgPath)
	}

	normImg, err := auth.NormalizePath(fullTarget)
	if err != nil {
		return "", "", fmt.Errorf("invalid image path: %w", err)
	}

	imgExt := strings.ToLower(filepath.Ext(normImg))
	mimeType, allowed := allowedImageExtensions[imgExt]
	if !allowed {
		return "", "", ErrUnsupportedImageExt
	}

	// Bounds checking:
	// Allowed locations:
	// 1. Inside docDir or its subdirectories
	// 2. Inside docDir/assets or docDir/{docName}.assets
	// 3. Inside docDir/../assets
	// 4. Inside an authorized workspace root
	allowedBounds := false

	// Check if inside docDir
	relToDocDir, errRel := filepath.Rel(strings.ToLower(docDir), strings.ToLower(normImg))
	if errRel == nil && !strings.HasPrefix(relToDocDir, "..") {
		allowedBounds = true
	}

	// Check ../assets
	parentAssets := filepath.Join(filepath.Dir(docDir), "assets")
	relToParentAssets, errRel2 := filepath.Rel(strings.ToLower(parentAssets), strings.ToLower(normImg))
	if errRel2 == nil && !strings.HasPrefix(relToParentAssets, "..") {
		allowedBounds = true
	}

	// Check {docName}.assets
	docAssets := filepath.Join(docDir, docNameWithoutExt+".assets")
	relToDocAssets, errRel3 := filepath.Rel(strings.ToLower(docAssets), strings.ToLower(normImg))
	if errRel3 == nil && !strings.HasPrefix(relToDocAssets, "..") {
		allowedBounds = true
	}

	// Check workspace authorization
	if !allowedBounds && auth.Default().IsPathAuthorized(normImg) {
		allowedBounds = true
	}

	if !allowedBounds {
		return "", "", ErrImageOutOfBounds
	}

	// Verify file stat
	stat, err := os.Stat(normImg)
	if err != nil {
		if os.IsNotExist(err) {
			return "", "", ErrImageNotFound
		}
		return "", "", err
	}
	if stat.IsDir() {
		return "", "", ErrImageNotFound
	}
	if stat.Size() > MaxImageBytes {
		return "", "", ErrImageTooLarge
	}

	// Generate opaque token
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	token := hex.EncodeToString(buf)

	entry := &ImageTokenEntry{
		Token:     token,
		DocPath:   normDoc,
		RealPath:  normImg,
		MimeType:  mimeType,
		CreatedAt: time.Now(),
	}

	r.mu.Lock()
	r.tokens[token] = entry
	r.mu.Unlock()

	tokenURL := fmt.Sprintf("/local-image/%s", token)
	return token, tokenURL, nil
}

// GetToken resolves a token to its ImageTokenEntry.
func (r *Registry) GetToken(token string) (*ImageTokenEntry, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	entry, ok := r.tokens[token]
	return entry, ok
}

// Middleware returns an HTTP middleware for Wails AssetServer that handles /local-image/{token} routes.
func (r *Registry) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		path := req.URL.Path
		if strings.HasPrefix(path, "/local-image/") {
			token := strings.TrimPrefix(path, "/local-image/")
			// Remove query params or trailing slashes
			if idx := strings.Index(token, "?"); idx != -1 {
				token = token[:idx]
			}
			token = strings.Trim(token, "/")

			entry, ok := r.GetToken(token)
			if !ok {
				http.Error(w, "Image token not found", http.StatusNotFound)
				return
			}

			// Read and serve file
			data, err := os.ReadFile(entry.RealPath)
			if err != nil {
				http.Error(w, "Failed to read image", http.StatusInternalServerError)
				return
			}

			// Security headers
			w.Header().Set("X-Content-Type-Options", "nosniff")
			contentType := entry.MimeType
			if contentType == "" {
				contentType = mime.TypeByExtension(filepath.Ext(entry.RealPath))
				if contentType == "" {
					contentType = "application/octet-stream"
				}
			}
			w.Header().Set("Content-Type", contentType)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(data)
			return
		}

		if next != nil {
			next.ServeHTTP(w, req)
		}
	})
}
