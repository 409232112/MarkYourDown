package assets

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestImageRegistry(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "myd-asset-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	docPath := filepath.Join(tmpDir, "docs", "note.md")
	if err := os.MkdirAll(filepath.Dir(docPath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(docPath, []byte("# Note"), 0644); err != nil {
		t.Fatal(err)
	}

	assetsDir := filepath.Join(filepath.Dir(docPath), "assets")
	if err := os.MkdirAll(assetsDir, 0755); err != nil {
		t.Fatal(err)
	}
	imgPath := filepath.Join(assetsDir, "photo.png")
	imgBytes := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A} // PNG header
	if err := os.WriteFile(imgPath, imgBytes, 0644); err != nil {
		t.Fatal(err)
	}

	reg := DefaultRegistry()

	// 1. Generate valid token
	token, tokenURL, err := reg.GenerateToken(docPath, "assets/photo.png")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}
	if token == "" || tokenURL != "/local-image/"+token {
		t.Errorf("Unexpected token URL: %s", tokenURL)
	}

	// 2. Out of bounds image (e.g. windows/win.ini)
	outsideDir, _ := os.MkdirTemp("", "myd-asset-outside-*")
	defer os.RemoveAll(outsideDir)
	outsideImg := filepath.Join(outsideDir, "secret.png")
	_ = os.WriteFile(outsideImg, imgBytes, 0644)

	_, _, err = reg.GenerateToken(docPath, outsideImg)
	if err == nil {
		t.Errorf("Expected out-of-bounds error for outside image")
	}

	// 3. Test HTTP middleware handler
	middleware := reg.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))

	req := httptest.NewRequest("GET", tokenURL, nil)
	rec := httptest.NewRecorder()
	middleware.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("Expected 200 OK, got %d", rec.Code)
	}
	if rec.Header().Get("Content-Type") != "image/png" {
		t.Errorf("Expected Content-Type image/png, got %s", rec.Header().Get("Content-Type"))
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("Expected X-Content-Type-Options nosniff")
	}
	if rec.Body.String() != string(imgBytes) {
		t.Errorf("Body content mismatch")
	}

	// 4. Test fallback to next handler
	reqOther := httptest.NewRequest("GET", "/index.html", nil)
	recOther := httptest.NewRecorder()
	middleware.ServeHTTP(recOther, reqOther)
	if recOther.Code != http.StatusTeapot {
		t.Errorf("Expected fallthrough to next handler, got %d", recOther.Code)
	}
}
