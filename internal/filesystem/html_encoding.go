package filesystem

import (
	"bytes"
	"fmt"
	"io"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/net/html"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

var htmlCharset = regexp.MustCompile(`(?i)\bcharset\s*=\s*["']?\s*([a-z0-9._-]+)`)

// DecodeHTMLContent detects only explicitly supported encodings; it never guesses GBK.
func DecodeHTMLContent(raw []byte, override string) (*DecodedText, error) {
	hash := ComputeHash(raw)
	if bytes.HasPrefix(raw, []byte{0xff, 0xfe}) || bytes.HasPrefix(raw, []byte{0xfe, 0xff}) {
		return nil, fmt.Errorf("UNSUPPORTED_ENCODING: UTF-16 暂不支持")
	}
	encoding := strings.ToLower(strings.TrimSpace(override))
	body := raw
	if bytes.HasPrefix(raw, []byte{0xef, 0xbb, 0xbf}) {
		encoding, body = "utf8bom", raw[3:]
	} else if encoding == "" {
		prefix := raw
		if len(prefix) > 1024 {
			prefix = prefix[:1024]
		}
		tokenizer := html.NewTokenizer(bytes.NewReader(prefix))
		for {
			kind := tokenizer.Next()
			if kind == html.ErrorToken {
				break
			}
			if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
				continue
			}
			tag := tokenizer.Token()
			if tag.Data != "meta" {
				continue
			}
			var charset, equiv, content string
			for _, attr := range tag.Attr {
				switch attr.Key {
				case "charset":
					charset = strings.TrimSpace(attr.Val)
				case "http-equiv":
					equiv = strings.TrimSpace(attr.Val)
				case "content":
					content = attr.Val
				}
			}
			if charset != "" {
				encoding = strings.ToLower(charset)
				break
			}
			if strings.EqualFold(equiv, "content-type") {
				if m := htmlCharset.FindStringSubmatch(content); len(m) > 1 {
					encoding = strings.ToLower(m[1])
					break
				}
			}
		}
		if encoding == "" {
			if !utf8.Valid(raw) {
				return nil, fmt.Errorf("UNSUPPORTED_ENCODING: 无法确定 HTML 编码，请选择编码")
			}
			encoding = "utf8"
		}
	}
	var text string
	switch encoding {
	case "utf8", "utf-8", "utf8bom":
		if !utf8.Valid(body) {
			return nil, fmt.Errorf("DECODE_FAILED: HTML 不是有效的 UTF-8")
		}
		text = string(body)
		if encoding != "utf8bom" {
			encoding = "utf8"
		}
	case "gbk", "gb2312", "gb18030":
		decoded, err := io.ReadAll(transform.NewReader(bytes.NewReader(body), simplifiedchinese.GB18030.NewDecoder()))
		if err != nil || !utf8.Valid(decoded) || strings.ContainsRune(string(decoded), '\uFFFD') {
			return nil, fmt.Errorf("DECODE_FAILED: HTML 编码解码失败")
		}
		text, encoding = string(decoded), "gb18030"
	default:
		return nil, fmt.Errorf("UNSUPPORTED_ENCODING: 不支持 HTML 编码 %s", encoding)
	}
	if len(text) > 40*1024*1024 {
		return nil, fmt.Errorf("FILE_TOO_LARGE: 解码后的 HTML 超过 40 MiB")
	}
	return &DecodedText{Text: text, Encoding: encoding, EOL: DetectEOL(text), Hash: hash}, nil
}
