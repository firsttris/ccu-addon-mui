package websocket

import (
	"compress/gzip"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// AssetsPath is where the app's scripts and styles are loaded from. The
// CCU's lighttpd has no compression module (modules.conf), so the archive
// carries them gzip-compressed only (scripts/compress-assets.mjs) and
// lighttpd forwards this path to the server (lighttpd.conf), which sends
// them as they are: about a third of the data, nothing to compress at
// runtime.
const AssetsPath = "/addons/mui/assets/"

func (s *Server) assetsHandler() http.Handler {
	dir := filepath.Join(s.cfg.AppDir, "assets")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// Vite puts all assets in one flat directory
		name := strings.TrimPrefix(r.URL.Path, AssetsPath)
		if name == "" || strings.ContainsAny(name, `/\`) || strings.HasPrefix(name, ".") {
			http.NotFound(w, r)
			return
		}
		// The names carry a content hash: they never change
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

		file, err := os.Open(filepath.Join(dir, name+".gz"))
		if err != nil {
			// Not compressed (fonts and images already are)
			http.ServeFile(w, r, filepath.Join(dir, name))
			return
		}
		defer file.Close()
		contentType := mime.TypeByExtension(filepath.Ext(name))
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Add("Vary", "Accept-Encoding")
		if acceptsGzip(r) {
			info, err := file.Stat()
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Encoding", "gzip")
			http.ServeContent(w, r, name, info.ModTime(), file)
			return
		}
		// A client without gzip (none of today's browsers): unpacked here
		reader, err := gzip.NewReader(file)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer reader.Close()
		if r.Method == http.MethodGet {
			_, _ = io.Copy(w, reader)
		}
	})
}

// acceptsGzip reports whether the request's Accept-Encoding allows gzip
func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		coding, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if strings.EqualFold(strings.TrimSpace(coding), "gzip") {
			return strings.ReplaceAll(strings.TrimSpace(params), " ", "") != "q=0"
		}
	}
	return false
}
