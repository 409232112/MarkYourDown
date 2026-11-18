package filesystem

import (
	"golang.org/x/text/encoding/simplifiedchinese"
	"strings"
	"testing"
)

func TestDecodeHTMLContent(t *testing.T) {
	gb, err := simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(`<meta charset="gb18030"><p>中文</p>`))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name     string
		raw      []byte
		override string
		contains string
		fail     bool
	}{
		{"utf8", []byte("<p>中文 �</p>"), "", "中文 �", false},
		{"bom", append([]byte{0xef, 0xbb, 0xbf}, []byte(`<meta charset="unknown">好`)...), "gbk", "好", false},
		{"gb", gb, "", "中文", false},
		{"unknown", []byte(`<meta charset="shift-jis">x`), "", "", true},
		{"no guess", []byte{0xff, 0x80}, "", "", true},
		{"utf16", []byte{0xff, 0xfe, 0, 0}, "utf8", "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := DecodeHTMLContent(tc.raw, tc.override)
			if tc.fail {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil || !strings.Contains(got.Text, tc.contains) {
				t.Fatalf("result %#v error %v", got, err)
			}
		})
	}
}

func TestHTMLCharsetOnlyHonorsActualMetaDeclarations(t *testing.T) {
	cases := []struct{ name, html, expected string }{
		{"comment", `<!-- <meta charset="shift-jis"> --><p>中文</p>`, "中文"},
		{"script", `<script>var s = '<meta charset="shift-jis">';</script><p>中文</p>`, "中文"},
		{"unrelated-meta", `<meta name="description" content="charset=shift-jis"><p>中文</p>`, "中文"},
		{"http-equiv", `<meta http-equiv="content-type" content="text/html; charset=UTF-8"><p>中文</p>`, "中文"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := DecodeHTMLContent([]byte(tc.html), "")
			if err != nil || !strings.Contains(got.Text, tc.expected) {
				t.Fatalf("doc=%+v err=%v", got, err)
			}
		})
	}
}
