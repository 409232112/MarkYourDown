package dto

// DiskFingerprint contains stat and content fingerprint of a document on disk.
type DiskFingerprint struct {
	MtimeMs int64  `json:"mtimeMs"`
	Size    int64  `json:"size"`
	Hash    string `json:"hash"` // SHA-1 hex digest of file bytes
}

// DocumentPayload is returned when a document is opened or reloaded.
type DocumentPayload struct {
	ID        string          `json:"id"`
	Path      string          `json:"path"`
	Title     string          `json:"title"`
	Content   string          `json:"content"`
	EOL       string          `json:"eol"`      // "crlf" | "lf" | "mixed"
	Encoding  string          `json:"encoding"` // "utf8" | "utf8bom" | "gbk"
	Disk      DiskFingerprint `json:"disk"`
	IsUnsaved bool            `json:"isUnsaved"`
}

// SaveFileRequest describes the parameters to save a document.
type SaveFileRequest struct {
	DocumentID       string `json:"documentId"`
	Path             string `json:"path"`
	Content          string `json:"content"`
	Revision         int    `json:"revision"`
	ExpectedDiskHash string `json:"expectedDiskHash"`
	Force            bool   `json:"force"`
	Encoding         string `json:"encoding,omitempty"`
	EOL              string `json:"eol,omitempty"`
}

// SaveFileResponse is returned after attempting to save a file.
type SaveFileResponse struct {
	DocumentID string          `json:"documentId"`
	Path       string          `json:"path"`
	Revision   int             `json:"revision"`
	Disk       DiskFingerprint `json:"disk"`
	Status     string          `json:"status"` // "clean" | "conflict" | "saveFailed"
	Error      string          `json:"error,omitempty"`
}

// FileStatusResponse reports external change status for a file.
type FileStatusResponse struct {
	DocumentID string          `json:"documentId"`
	Path       string          `json:"path"`
	Status     string          `json:"status"` // "clean" | "conflict" | "deleted"
	Disk       DiskFingerprint `json:"disk"`
}

// SaveImageRequest parameters for saving an image pasted or dropped into a document.
type SaveImageRequest struct {
	DocPath   string `json:"docPath"`
	ImageData string `json:"imageData"` // base64 encoded data
	Filename  string `json:"filename,omitempty"`
}

// SaveImageResponse returns the relative path and token URL for the saved image.
type SaveImageResponse struct {
	RelativePath string `json:"relativePath"`
	TokenURL     string `json:"tokenUrl"`
}

// FileTreeNode represents a directory or file in a workspace tree.
type FileTreeNode struct {
	Name     string          `json:"name"`
	Path     string          `json:"path"`
	IsDir    bool            `json:"isDir"`
	Size     int64           `json:"size,omitempty"`
	Children []*FileTreeNode `json:"children,omitempty"`
}

// WorkspaceInfo represents an opened workspace folder.
type WorkspaceInfo struct {
	RootPath string        `json:"rootPath"`
	Name     string        `json:"name"`
	Tree     *FileTreeNode `json:"tree"`
}

// FileChangeEvent is emitted when a file in the workspace or an open document is modified.
type FileChangeEvent struct {
	Type    string `json:"type"` // "create" | "write" | "remove" | "rename"
	Path    string `json:"path"`
	OldPath string `json:"oldPath,omitempty"`
}

// BackupItem represents a single document's backup on disk.
type BackupItem struct {
	V        int    `json:"v"` // version 1
	ID       string `json:"id"`
	Path     string `json:"path"`
	Title    string `json:"title"`
	Content  string `json:"content"`
	EOL      string `json:"eol"`
	Encoding string `json:"encoding"`
	BaseHash string `json:"baseHash"`
	SavedAt  int64  `json:"savedAt"` // Unix timestamp in ms
	CRC32    uint32 `json:"crc32"`
}

// SessionTab represents a tab state in the saved session.
type SessionTab struct {
	ID    string `json:"id"`
	Path  string `json:"path,omitempty"`
	Title string `json:"title"`
	Mode  string `json:"mode"` // "live" | "source"
}

// SessionData stores overall window and document session state.
type SessionData struct {
	ActiveTabID    string       `json:"activeTabId"`
	Tabs           []SessionTab `json:"tabs"`
	WorkspacePath  string       `json:"workspacePath,omitempty"`
	SidebarActive  string       `json:"sidebarActive,omitempty"` // "outline" | "files"
	SidebarOpen    bool         `json:"sidebarOpen"`
}

// AppSettings stores user configurations aligned with frontend Pinia store.
type AppSettings struct {
	// Appearance
	Theme       string  `json:"theme"`
	ContentFont string  `json:"contentFont"`
	FontSize    int     `json:"fontSize"`
	LineHeight  float64 `json:"lineHeight"`
	ContentWidth int    `json:"contentWidth"`

	// General
	StartupAction   string `json:"startupAction"`
	AutoSave        bool   `json:"autoSave"`
	AutoSaveInterval int   `json:"autoSaveInterval"`
	AutoSaveOnBlur  bool   `json:"autoSaveOnBlur"`
	DefaultEOL      string `json:"defaultEol"`
	DefaultEncoding string `json:"defaultEncoding"`
	ImageDir        string `json:"imageDir"`

	// Editor
	SoftWrap           bool   `json:"softWrap"`
	AutoCloseBrackets  bool   `json:"autoCloseBrackets"`
	PasteAsMarkdown    bool   `json:"pasteAsMarkdown"`
	CodeLineNumbers    bool   `json:"codeLineNumbers"`
	CodeWrap           bool   `json:"codeWrap"`
	CodeStripPrompt    bool   `json:"codeStripPrompt"`
	NetworkImagePolicy string `json:"networkImagePolicy"`

	// Export
	HtmlEmbedImages bool `json:"htmlEmbedImages"`
	HtmlIncludeToc  bool `json:"htmlIncludeToc"`
}

// RecentFileItem represents an item in the recent files history.
type RecentFileItem struct {
	Path       string `json:"path"`
	Title      string `json:"title"`
	LastOpened int64  `json:"lastOpened"`
}

// ExportJob encapsulates an authorized export target and token.
type ExportJob struct {
	JobID      string `json:"jobId"`
	Format     string `json:"format"` // "html" | "pdf" | "docx"
	TargetPath string `json:"targetPath"`
	ExpiresAt  int64  `json:"expiresAt"`
}

// CreateExportJobRequest parameters.
type CreateExportJobRequest struct {
	Format      string `json:"format"`
	DefaultName string `json:"defaultName"`
}

// WriteExportPayloadRequest parameters.
type WriteExportPayloadRequest struct {
	JobID         string `json:"jobId"`
	PayloadBase64 string `json:"payloadBase64"`
}
