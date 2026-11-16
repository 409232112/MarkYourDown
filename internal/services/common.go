package services

import (
	"os"
	"path/filepath"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

var (
	appInstance       *application.App
	appMu             sync.RWMutex
	customUserDataDir string
	customUserDataMu  sync.RWMutex
)

// SetCustomUserDataDir overrides the user data directory (useful for unit tests).
func SetCustomUserDataDir(dir string) {
	customUserDataMu.Lock()
	defer customUserDataMu.Unlock()
	customUserDataDir = dir
}

// SetApp sets the global application reference for services.
func SetApp(app *application.App) {
	appMu.Lock()
	defer appMu.Unlock()
	appInstance = app
}

// GetApp retrieves the application reference.
func GetApp() *application.App {
	appMu.RLock()
	defer appMu.RUnlock()
	return appInstance
}

// GetUserDataDir returns the application data directory (%APPDATA%/MarkYourDown on Windows).
func GetUserDataDir() (string, error) {
	customUserDataMu.RLock()
	if customUserDataDir != "" {
		defer customUserDataMu.RUnlock()
		return customUserDataDir, nil
	}
	customUserDataMu.RUnlock()

	base, err := os.UserConfigDir()
	if err != nil {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "MarkYourDown")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}
