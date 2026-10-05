package websocket

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"ccu-addon-mui-server/pkg/config"
)

func TestAssetsHandler(t *testing.T) {
	dir := t.TempDir()
	assets := filepath.Join(dir, "assets")
	if err := os.MkdirAll(assets, 0o755); err != nil {
		t.Fatal(err)
	}
	script := []byte("console.log('mui');")
	var packed bytes.Buffer
	zw := gzip.NewWriter(&packed)
	_, _ = zw.Write(script)
	_ = zw.Close()
	_ = os.WriteFile(filepath.Join(assets, "index-abc.js.gz"), packed.Bytes(), 0o644)
	_ = os.WriteFile(filepath.Join(assets, "font-abc.woff2"), []byte("font"), 0o644)
	s := NewServer(&config.Config{AppDir: dir}, nil)
	handler := s.assetsHandler()

	get := func(path, encoding string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if encoding != "" {
			r.Header.Set("Accept-Encoding", encoding)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	// Sent compressed as it is
	w := get(AssetsPath+"index-abc.js", "gzip, deflate, br")
	if w.Code != http.StatusOK || w.Header().Get("Content-Encoding") != "gzip" || !bytes.Equal(w.Body.Bytes(), packed.Bytes()) {
		t.Fatalf("gzip: %d %q", w.Code, w.Header().Get("Content-Encoding"))
	}
	if ct := w.Header().Get("Content-Type"); ct == "" || ct == "application/octet-stream" || ct == "application/gzip" {
		t.Fatalf("content type of the script, got %q", ct)
	}
	if w.Header().Get("Cache-Control") == "" {
		t.Fatal("hashed assets are cached")
	}

	// Unpacked for a client without gzip
	w = get(AssetsPath+"index-abc.js", "")
	body, _ := io.ReadAll(w.Body)
	if w.Code != http.StatusOK || w.Header().Get("Content-Encoding") != "" || !bytes.Equal(body, script) {
		t.Fatalf("plain: %d %q %q", w.Code, w.Header().Get("Content-Encoding"), body)
	}
	if w = get(AssetsPath+"index-abc.js", "gzip;q=0"); w.Header().Get("Content-Encoding") != "" {
		t.Fatal("gzip;q=0 refuses gzip")
	}

	// Files that aren't compressed as they are
	if w = get(AssetsPath+"font-abc.woff2", "gzip"); w.Code != http.StatusOK || w.Body.String() != "font" || w.Header().Get("Content-Encoding") != "" {
		t.Fatalf("plain file: %d %q", w.Code, w.Body.String())
	}

	// Nothing outside the directory
	for _, path := range []string{AssetsPath, AssetsPath + "..%2Fsecret", AssetsPath + "sub/x.js", AssetsPath + ".hidden", AssetsPath + "missing.js"} {
		if w = get(path, "gzip"); w.Code != http.StatusNotFound {
			t.Fatalf("%s: got %d, want 404", path, w.Code)
		}
	}
}
