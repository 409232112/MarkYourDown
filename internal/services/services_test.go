package services

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"markyourdown/internal/auth"
	"markyourdown/internal/dto"
)

func TestSettingsService(t *testing.T) {
	tmpData, err := os.MkdirTemp("", "myd-settings-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpData)
	SetCustomUserDataDir(tmpData)
	defer SetCustomUserDataDir("")

	svc := NewSettingsService()

	settings, err := svc.GetSettings()
	if err != nil {
		t.Fatalf("GetSettings failed: %v", err)
	}
	if settings.Theme != "warm" {
		t.Errorf("Expected default theme 'warm', got %s", settings.Theme)
	}

	settings.Theme = "night"
	if err := svc.SaveSettings(*settings); err != nil {
		t.Fatalf("SaveSettings failed: %v", err)
	}

	updated, err := svc.GetSettings()
	if err != nil || updated.Theme != "night" {
		t.Errorf("Expected updated theme 'night', got %v", updated)
	}

	// Test recent files
	_ = svc.ClearRecentFiles()
	_ = svc.AddRecentFile("C:\\test\\doc1.md", "Doc 1")
	_ = svc.AddRecentFile("C:\\test\\doc2.md", "Doc 2")

	recent, err := svc.GetRecentFiles()
	if err != nil || len(recent) != 2 {
		t.Fatalf("Expected 2 recent items, got %d, err: %v", len(recent), err)
	}
	if recent[0].Path != "C:\\test\\doc2.md" {
		t.Errorf("Expected most recent item first, got %s", recent[0].Path)
	}

	_ = svc.RemoveRecentFile("C:\\test\\doc1.md")
	recentAfterRemove, _ := svc.GetRecentFiles()
	if len(recentAfterRemove) != 1 || recentAfterRemove[0].Path != "C:\\test\\doc2.md" {
		t.Errorf("Expected 1 recent item after remove, got %d", len(recentAfterRemove))
	}
}

func TestBackupService(t *testing.T) {
	tmpData, err := os.MkdirTemp("", "myd-backup-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpData)
	SetCustomUserDataDir(tmpData)
	defer SetCustomUserDataDir("")

	bs := NewBackupService()

	item := dto.BackupItem{
		ID:       "doc-123",
		Path:     "C:\\test\\backup.md",
		Title:    "Backup Test",
		Content:  "# Important content",
		EOL:      "crlf",
		Encoding: "utf8",
	}

	if err := bs.SaveBackup(item); err != nil {
		t.Fatalf("SaveBackup failed: %v", err)
	}

	list, err := bs.ListBackups()
	if err != nil {
		t.Fatalf("ListBackups failed: %v", err)
	}

	found := false
	for _, it := range list {
		if it.ID == "doc-123" {
			found = true
			if it.Content != item.Content {
				t.Errorf("Backup content mismatch")
			}
		}
	}
	if !found {
		t.Errorf("Expected backup doc-123 in list")
	}

	if err := bs.RemoveBackup("doc-123"); err != nil {
		t.Fatalf("RemoveBackup failed: %v", err)
	}

	// Test invalid doc ID traversal rejection
	badItem := item
	badItem.ID = "../../evil"
	if err := bs.SaveBackup(badItem); err == nil {
		t.Errorf("Expected error for traversal doc ID in SaveBackup")
	}
	if err := bs.RemoveBackup("../../evil"); err == nil {
		t.Errorf("Expected error for traversal doc ID in RemoveBackup")
	}

	// Test AuthorizeRestoredDraftByID
	// 1. Invalid ID / traversal must fail
	if ok, _ := bs.AuthorizeRestoredDraftByID("../../evil"); ok {
		t.Errorf("Expected traversal ID in AuthorizeRestoredDraftByID to fail")
	}

	// 2. Non-existent backup ID must fail
	if ok, _ := bs.AuthorizeRestoredDraftByID("nonexistent-backup-id"); ok {
		t.Errorf("Expected nonexistent backup ID to fail")
	}

	// 3. Arbitrary non-backup paths cannot be authorized (must be valid backup ID)
	if ok, _ := bs.AuthorizeRestoredDraftByID("C:\\Windows\\System32\\cmd.exe"); ok {
		t.Errorf("Arbitrary non-backup path string must be rejected as invalid backup ID")
	}

	// 4. Save a valid backup item with an existing file path
	realFile := filepath.Join(tmpData, "existing_draft.md")
	_ = os.WriteFile(realFile, []byte("hello draft"), 0644)
	validDraft := dto.BackupItem{
		ID:    "draft-test-1",
		Path:  realFile,
		Title: "Existing Draft",
	}
	if err := bs.SaveBackup(validDraft); err != nil {
		t.Fatalf("SaveBackup failed: %v", err)
	}

	ok, err := bs.AuthorizeRestoredDraftByID("draft-test-1")
	if !ok || err != nil {
		t.Errorf("AuthorizeRestoredDraftByID existing file failed: %v", err)
	}
	if _, valErr := auth.Default().ValidateFileRead(realFile); valErr != nil {
		t.Errorf("Expected restored draft path to be authorized in auth service: %v", valErr)
	}

	// 5. Backup containing deleted/missing file must fail
	missingDraft := dto.BackupItem{
		ID:    "draft-test-2",
		Path:  filepath.Join(tmpData, "deleted_draft.md"),
		Title: "Missing Draft",
	}
	_ = bs.SaveBackup(missingDraft)
	if ok, _ := bs.AuthorizeRestoredDraftByID("draft-test-2"); ok {
		t.Errorf("Expected backup with missing disk file to fail authorization")
	}

	// 6. Backup containing non-whitelisted extension (.exe) must fail
	disallowedDraft := dto.BackupItem{
		ID:    "draft-test-3",
		Path:  filepath.Join(tmpData, "malicious.exe"),
		Title: "Malicious Draft",
	}
	_ = os.WriteFile(disallowedDraft.Path, []byte("binary"), 0644)
	_ = bs.SaveBackup(disallowedDraft)
	if ok, _ := bs.AuthorizeRestoredDraftByID("draft-test-3"); ok {
		t.Errorf("Expected backup with disallowed extension to fail authorization")
	}
}

func TestFileAndWorkspaceServices(t *testing.T) {
	tmpData, err := os.MkdirTemp("", "myd-data-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpData)
	SetCustomUserDataDir(tmpData)
	defer SetCustomUserDataDir("")

	tmpDir, err := os.MkdirTemp("", "myd-services-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	settingsSvc := NewSettingsService()
	backupSvc := NewBackupService()
	fileSvc := NewFileService(settingsSvc, backupSvc)
	wsSvc := NewWorkspaceService()

	// Verify unauthorized workspace is rejected
	_, err = wsSvc.OpenWorkspaceByPath(tmpDir)
	if err == nil {
		t.Fatalf("Expected error opening unauthorized workspace path")
	}

	// Authorize workspace
	_, err = auth.Default().AuthorizeDirectory(tmpDir)
	if err != nil {
		t.Fatalf("AuthorizeDirectory failed: %v", err)
	}

	// Open workspace
	wsInfo, err := wsSvc.OpenWorkspaceByPath(tmpDir)
	if err != nil {
		t.Fatalf("OpenWorkspaceByPath failed: %v", err)
	}
	if wsInfo.Name != filepath.Base(tmpDir) {
		t.Errorf("Unexpected workspace name: %s", wsInfo.Name)
	}

	// Create file in workspace
	node, err := wsSvc.CreateFile(tmpDir, "test.md")
	if err != nil {
		t.Fatalf("CreateFile failed: %v", err)
	}
	if node.Name != "test.md" {
		t.Errorf("Unexpected node name: %s", node.Name)
	}

	// Save file with FileService
	saveResp, err := fileSvc.SaveFile(dto.SaveFileRequest{
		DocumentID:       "doc-1",
		Path:             node.Path,
		Content:          "# Content 1",
		Revision:         1,
		ExpectedDiskHash: "",
		Force:            true,
	})
	if err != nil || saveResp.Status != "clean" {
		t.Fatalf("SaveFile failed: %v, resp: %+v", err, saveResp)
	}

	// External change conflict check
	// Modify directly on disk behind application's back
	_ = os.WriteFile(node.Path, []byte("# Modified outside"), 0644)

	// Save without Force using previous disk hash should return conflict
	conflictResp, err := fileSvc.SaveFile(dto.SaveFileRequest{
		DocumentID:       "doc-1",
		Path:             node.Path,
		Content:          "# Content 2",
		Revision:         2,
		ExpectedDiskHash: saveResp.Disk.Hash,
		Force:            false,
	})
	if err != nil {
		t.Fatalf("SaveFile unexpected error: %v", err)
	}
	if conflictResp.Status != "conflict" {
		t.Errorf("Expected status 'conflict', got '%s'", conflictResp.Status)
	}

	// Test SaveImage
	imgData := base64.StdEncoding.EncodeToString([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A})
	imgResp, err := fileSvc.SaveImage(dto.SaveImageRequest{
		DocPath:   node.Path,
		ImageData: imgData,
		Filename:  "pasted.png",
	})
	if err != nil {
		t.Fatalf("SaveImage failed: %v", err)
	}
	if !strings.HasPrefix(imgResp.RelativePath, "./assets/") {
		t.Errorf("Unexpected image relative path: %s", imgResp.RelativePath)
	}

	// Test SaveImage invalid magic bytes
	badImgData := base64.StdEncoding.EncodeToString([]byte("MZ...This is not an image"))
	_, err = fileSvc.SaveImage(dto.SaveImageRequest{
		DocPath:   node.Path,
		ImageData: badImgData,
		Filename:  "fake.png",
	})
	if err == nil {
		t.Errorf("Expected SaveImage to reject invalid magic bytes")
	}

	// Test OpenFileByPath on non-existent file
	_, err = fileSvc.OpenFileByPath("nonexistent_random_file_12345.md")
	if err == nil {
		t.Errorf("Expected OpenFileByPath to fail on non-existent file")
	}

	// Test RenamePath
	renamedPath, err := wsSvc.RenamePath(node.Path, "renamed.md")
	if err != nil {
		t.Fatalf("RenamePath failed: %v", err)
	}
	if filepath.Base(renamedPath) != "renamed.md" {
		t.Errorf("Expected renamed.md, got %s", renamedPath)
	}

	// Test RenamePath collision (should NOT overwrite existing file)
	anotherNode, err := wsSvc.CreateFile(tmpDir, "another.md")
	if err != nil {
		t.Fatalf("CreateFile another.md failed: %v", err)
	}
	_, err = wsSvc.RenamePath(anotherNode.Path, "renamed.md")
	if err == nil {
		t.Errorf("Expected RenamePath to fail when destination already exists")
	}

	// Test RenamePath traversal rejection
	_, err = wsSvc.RenamePath(anotherNode.Path, "../escape.md")
	if err == nil {
		t.Errorf("Expected RenamePath to reject path traversal")
	}

	// Test CreateFile invalid extension rejection
	_, err = wsSvc.CreateFile(tmpDir, "malware.exe")
	if err == nil {
		t.Errorf("Expected CreateFile to reject non-markdown/txt extension")
	}

	// Workspace tree
	tree, err := wsSvc.GetWorkspaceTree(tmpDir, false)
	if err != nil {
		t.Fatalf("GetWorkspaceTree failed: %v", err)
	}
	if len(tree.Children) == 0 {
		t.Errorf("Expected files in tree")
	}

	// Authorize outside path should be blocked
	outsideDir, _ := os.MkdirTemp("", "myd-outside-*")
	defer os.RemoveAll(outsideDir)
	_, err = wsSvc.CreateFile(outsideDir, "blocked.md")
	if err == nil {
		t.Errorf("Expected error creating file in unauthorized outsideDir")
	}
}
