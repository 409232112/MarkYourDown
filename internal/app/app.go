package app

import (
	"embed"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"markyourdown/internal/assets"
	"markyourdown/internal/auth"
	"markyourdown/internal/services"
)

// AppContext holds the application instance and initialized services.
type AppContext struct {
	App              *application.App
	MainWindow       *application.WebviewWindow
	FileService      *services.FileService
	WorkspaceService *services.WorkspaceService
	BackupService    *services.BackupService
	SettingsService  *services.SettingsService
	ExportService    *services.ExportService
}

// CreateApp creates and configures the Wails v3 application.
func CreateApp(frontendAssets embed.FS) *AppContext {
	settingsSvc := services.NewSettingsService()
	backupSvc := services.NewBackupService()
	fileSvc := services.NewFileService(settingsSvc, backupSvc)
	wsSvc := services.NewWorkspaceService()
	exportSvc := services.NewExportService()

	var mainWindow *application.WebviewWindow
	var app *application.App

	app = application.New(application.Options{
		Name:        "MarkYourDown",
		Description: "类 Typora 的 Markdown 所见即所得编辑器",
		Services: []application.Service{
			application.NewService(fileSvc),
			application.NewService(wsSvc),
			application.NewService(backupSvc),
			application.NewService(settingsSvc),
			application.NewService(exportSvc),
		},
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(frontendAssets),
			Middleware: assets.DefaultRegistry().Middleware,
		},
		FileAssociations: []string{".md", ".markdown", ".mdown"},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "com.markyourdown.app",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				if mainWindow != nil {
					mainWindow.Show()
					mainWindow.Focus()
				}
				if len(data.Args) > 1 {
					rawPath := data.Args[1]
					var targetPath string
					if filepath.IsAbs(rawPath) {
						targetPath = rawPath
					} else {
						targetPath = filepath.Join(data.WorkingDir, rawPath)
					}
					norm, err := auth.NormalizePath(targetPath)
					if err == nil {
						if st, sErr := os.Stat(norm); sErr == nil && st.IsDir() {
							_, _ = auth.Default().AuthorizeDirectory(norm)
							app.Event.Emit("app:open-workspace", norm)
						} else {
							_, _ = auth.Default().AuthorizeFile(norm)
							app.Event.Emit("app:open-file", norm)
						}
					}
				}
			},
		},
	})

	services.SetApp(app)

	mainWindow = app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:                      "MarkYourDown",
		Width:                      1200,
		Height:                     800,
		MinWidth:                   800,
		MinHeight:                  600,
		Frameless:                  true,
		EnableFileDrop:             true,
		DefaultContextMenuDisabled: true,
		BackgroundColour:           application.NewRGB(250, 249, 245), // Warm paper (#FAF9F5)
		URL:                        "/",
		Windows: application.WindowsWindow{
			NonClientRegionSupport: true,
		},
	})

	// Handle native file drop events
	mainWindow.OnWindowEvent(events.Common.WindowFilesDropped, func(e *application.WindowEvent) {
		if mainWindow != nil {
			mainWindow.Focus()
		}
		ctx := e.Context()
		if ctx == nil {
			return
		}
		files := ctx.DroppedFiles()
		for _, f := range files {
			norm, err := auth.NormalizePath(f)
			if err == nil {
				if st, sErr := os.Stat(norm); sErr == nil && st.IsDir() {
					_, _ = auth.Default().AuthorizeDirectory(norm)
					app.Event.Emit("app:open-workspace", norm)
				} else {
					_, _ = auth.Default().AuthorizeFile(norm)
					app.Event.Emit("app:open-file", norm)
				}
			}
		}
	})

	// Handle command line file argument if passed directly
	if len(os.Args) > 1 {
		rawPath := os.Args[1]
		norm, err := auth.NormalizePath(rawPath)
		if err == nil {
			if st, sErr := os.Stat(norm); sErr == nil && st.IsDir() {
				_, _ = auth.Default().AuthorizeDirectory(norm)
				mainWindow.OnWindowEvent(events.Common.WindowRuntimeReady, func(e *application.WindowEvent) {
					app.Event.Emit("app:open-workspace", norm)
				})
			} else {
				_, _ = auth.Default().AuthorizeFile(norm)
				// Emit once runtime is ready
				mainWindow.OnWindowEvent(events.Common.WindowRuntimeReady, func(e *application.WindowEvent) {
					app.Event.Emit("app:open-file", norm)
				})
			}
		}
	}

	return &AppContext{
		App:              app,
		MainWindow:       mainWindow,
		FileService:      fileSvc,
		WorkspaceService: wsSvc,
		BackupService:    backupSvc,
		SettingsService:  settingsSvc,
		ExportService:    exportSvc,
	}
}
