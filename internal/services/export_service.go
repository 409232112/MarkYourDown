package services

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"markyourdown/internal/auth"
	"markyourdown/internal/dto"
	"markyourdown/internal/filesystem"
	"markyourdown/internal/platform/windows"
)

var (
	ErrPayloadTooLarge = errors.New("export payload exceeds maximum size of 100MB")
)

const (
	MaxExportPayloadBytes = 100 * 1024 * 1024 // 100MB
)

// ExportService manages document export workflows and safe target landing.
type ExportService struct{}

// NewExportService creates a new ExportService.
func NewExportService() *ExportService {
	return &ExportService{}
}

// CreateExportJob displays a native SaveFileDialog and grants a temporary export authorization.
func (e *ExportService) CreateExportJob(req dto.CreateExportJobRequest) (*dto.ExportJob, error) {
	app := GetApp()
	if app == nil {
		return nil, errors.New("application not initialized")
	}

	dialog := app.Dialog.SaveFile()

	format := strings.ToLower(req.Format)
	var defaultExt string
	switch format {
	case "html":
		dialog.AddFilter("HTML 文件 (*.html)", "*.html")
		defaultExt = ".html"
	case "pdf":
		dialog.AddFilter("PDF 文件 (*.pdf)", "*.pdf")
		defaultExt = ".pdf"
	case "docx":
		dialog.AddFilter("Word 文档 (*.docx)", "*.docx")
		defaultExt = ".docx"
	default:
		return nil, fmt.Errorf("unsupported export format: %s", format)
	}

	if req.DefaultName != "" {
		if !strings.HasSuffix(strings.ToLower(req.DefaultName), defaultExt) {
			dialog.SetFilename(req.DefaultName + defaultExt)
		} else {
			dialog.SetFilename(req.DefaultName)
		}
	}

	chosenPath, err := dialog.PromptForSingleSelection()
	if err != nil {
		return nil, err
	}
	if chosenPath == "" {
		// User cancelled dialog
		return nil, nil
	}

	// Ensure proper extension
	if !strings.HasSuffix(strings.ToLower(chosenPath), defaultExt) {
		chosenPath = chosenPath + defaultExt
	}

	// Generate random job ID
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return nil, err
	}
	jobID := hex.EncodeToString(buf)

	expiryDuration := 10 * time.Minute
	rec, err := auth.Default().RegisterExportJob(jobID, chosenPath, format, expiryDuration)
	if err != nil {
		return nil, err
	}

	return &dto.ExportJob{
		JobID:      rec.JobID,
		Format:     rec.Format,
		TargetPath: rec.TargetPath,
		ExpiresAt:  rec.ExpiresAt.UnixMilli(),
	}, nil
}

// WriteExportPayload atomically writes the exported document payload to the pre-authorized destination.
func (e *ExportService) WriteExportPayload(req dto.WriteExportPayloadRequest) error {
	rec, err := auth.Default().ValidateAndConsumeExportJob(req.JobID)
	if err != nil {
		return err
	}

	data, err := base64.StdEncoding.DecodeString(req.PayloadBase64)
	if err != nil {
		return fmt.Errorf("invalid base64 payload: %w", err)
	}

	if len(data) > MaxExportPayloadBytes {
		return ErrPayloadTooLarge
	}

	if err := filesystem.WriteFileAtomic(rec.TargetPath, data); err != nil {
		return fmt.Errorf("failed to write export file: %w", err)
	}

	_ = windows.RegisterRecentDoc(rec.TargetPath)
	return nil
}

// RevealExportFile highlights the exported file in Windows Explorer.
func (e *ExportService) RevealExportFile(targetPath string) error {
	norm, err := auth.NormalizePath(targetPath)
	if err != nil {
		return err
	}
	return windows.RevealInExplorer(norm)
}
