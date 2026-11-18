package dto

type HtmlReference struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Original string `json:"original"`
	Resolved string `json:"resolved"`
	State    string `json:"state"`
}
type BeginHtmlSaveRequest struct {
	DocumentID    string          `json:"documentId"`
	SourcePath    string          `json:"sourcePath"`
	SuggestedName string          `json:"suggestedName"`
	References    []HtmlReference `json:"references"`
}
type HtmlRewrite struct {
	ReferenceID string `json:"referenceId"`
	From        string `json:"from"`
	To          string `json:"to"`
}
type BeginHtmlSaveResponse struct {
	Status     string        `json:"status"`
	Ticket     string        `json:"ticket,omitempty"`
	TargetPath string        `json:"targetPath,omitempty"`
	Rewrites   []HtmlRewrite `json:"rewrites,omitempty"`
	Warnings   []string      `json:"warnings,omitempty"`
	ExpiresAt  int64         `json:"expiresAt,omitempty"`
}
type CommitHtmlSaveRequest struct {
	Ticket   string `json:"ticket"`
	Markdown string `json:"markdown"`
	EOL      string `json:"eol"`
}
type CommitHtmlSaveResponse struct {
	Status   string          `json:"status"`
	Path     string          `json:"path,omitempty"`
	Disk     DiskFingerprint `json:"disk"`
	Encoding string          `json:"encoding,omitempty"`
	Code     string          `json:"code,omitempty"`
	Message  string          `json:"message,omitempty"`
}
type AbortHtmlSaveRequest struct {
	Ticket string `json:"ticket"`
}
type AbortHtmlSaveResponse struct {
	Status string `json:"status"`
}
