package filesystem

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

var (
	ErrInvalidEncoding = errors.New("file content cannot be decoded with supported encodings")
	ErrGBKEncodeFailed = errors.New("content contains characters not representable in GBK")
)

// DecodedText contains the UTF-8 text representation, detected encoding, BOM, EOL, and SHA-1 hash.
type DecodedText struct {
	Text     string
	Encoding string // "utf8" | "utf8bom" | "gbk"
	EOL      string // "crlf" | "lf" | "mixed"
	Hash     string
}

// ComputeHash returns SHA-1 hex digest of bytes.
func ComputeHash(b []byte) string {
	h := sha1.Sum(b)
	return hex.EncodeToString(h[:])
}

// DetectEOL examines line endings in the text.
func DetectEOL(text string) string {
	hasCRLF := strings.Contains(text, "\r\n")
	hasLF := false

	// Count raw LFs that are not preceded by CR
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			if i == 0 || text[i-1] != '\r' {
				hasLF = true
				break
			}
		}
	}

	if hasCRLF && hasLF {
		return "mixed"
	}
	if hasCRLF {
		return "crlf"
	}
	if strings.Contains(text, "\n") {
		return "lf"
	}
	return "crlf" // default on Windows if single line
}

// DecodeFileContent decodes raw bytes into UTF-8 text and identifies BOM, encoding, and line ending.
func DecodeFileContent(raw []byte) (*DecodedText, error) {
	hash := ComputeHash(raw)

	// Check UTF-16 BOMs and reject explicitly to prevent silent corruption
	if bytes.HasPrefix(raw, []byte{0xFE, 0xFF}) || bytes.HasPrefix(raw, []byte{0xFF, 0xFE}) {
		return nil, fmt.Errorf("%w: UTF-16 is not supported", ErrInvalidEncoding)
	}

	// Check UTF-8 BOM
	if bytes.HasPrefix(raw, []byte{0xEF, 0xBB, 0xBF}) {
		body := raw[3:]
		if !utf8.Valid(body) {
			return nil, ErrInvalidEncoding
		}
		text := string(body)
		return &DecodedText{
			Text:     text,
			Encoding: "utf8bom",
			EOL:      DetectEOL(text),
			Hash:     hash,
		}, nil
	}

	// Check valid UTF-8 without BOM
	if utf8.Valid(raw) {
		text := string(raw)
		return &DecodedText{
			Text:     text,
			Encoding: "utf8",
			EOL:      DetectEOL(text),
			Hash:     hash,
		}, nil
	}

	// Try Simplified Chinese GBK / GB18030 decoding
	reader := transform.NewReader(bytes.NewReader(raw), simplifiedchinese.GB18030.NewDecoder())
	decoded, err := io.ReadAll(reader)
	if err == nil && utf8.Valid(decoded) && !strings.ContainsRune(string(decoded), '\uFFFD') {
		text := string(decoded)
		return &DecodedText{
			Text:     text,
			Encoding: "gbk",
			EOL:      DetectEOL(text),
			Hash:     hash,
		}, nil
	}

	return nil, fmt.Errorf("%w: unable to parse as UTF-8 or GBK/GB18030", ErrInvalidEncoding)
}

// EncodeFileContent encodes a UTF-8 text back to the target encoding and EOL format.
func EncodeFileContent(text string, targetEncoding, targetEOL string) ([]byte, error) {
	// 1. Standardize or convert EOL
	normalized := text
	if targetEOL == "crlf" {
		// Convert all bare \n to \r\n
		normalized = strings.ReplaceAll(normalized, "\r\n", "\n")
		normalized = strings.ReplaceAll(normalized, "\n", "\r\n")
	} else if targetEOL == "lf" {
		normalized = strings.ReplaceAll(normalized, "\r\n", "\n")
	}

	// 2. Encode to target character set
	switch strings.ToLower(targetEncoding) {
	case "utf8", "":
		return []byte(normalized), nil

	case "utf8bom":
		buf := make([]byte, 3+len(normalized))
		copy(buf[0:3], []byte{0xEF, 0xBB, 0xBF})
		copy(buf[3:], normalized)
		return buf, nil

	case "gbk", "gb18030":
		// Encode via GB18030 encoder (superset of GBK, covers all Chinese extensions)
		reader := transform.NewReader(strings.NewReader(normalized), simplifiedchinese.GB18030.NewEncoder())
		encoded, err := io.ReadAll(reader)
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrGBKEncodeFailed, err)
		}
		return encoded, nil

	default:
		return nil, fmt.Errorf("unsupported encoding: %s", targetEncoding)
	}
}
