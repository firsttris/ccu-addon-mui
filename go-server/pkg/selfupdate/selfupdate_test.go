package selfupdate

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type entry struct {
	name, body string
	mode       int64
	typ        byte
}

func archive(t *testing.T, entries ...entry) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for _, e := range entries {
		typ := e.typ
		if typ == 0 {
			typ = tar.TypeReg
		}
		header := &tar.Header{Name: e.name, Mode: e.mode, Size: int64(len(e.body)), Typeflag: typ}
		if typ != tar.TypeReg {
			header.Size = 0
		}
		if typ == tar.TypeSymlink {
			header.Linkname = "/etc/passwd"
		}
		if err := tw.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if typ == tar.TypeReg {
			_, _ = tw.Write([]byte(e.body))
		}
	}
	_ = tw.Close()
	_ = gz.Close()
	return buf.Bytes()
}

// A release server like GitHub's: the API answer and the archives
func releaseServer(t *testing.T, data []byte, digest string) *httptest.Server {
	t.Helper()
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/latest":
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"tag_name": "v1.2.3",
				"assets": []map[string]string{
					{"name": "mui-1.2.3-x86_64-pc.tar.gz", "browser_download_url": server.URL + "/amd64.tar.gz", "digest": "sha256:" + strings.Repeat("0", 64)},
					{"name": "mui-1.2.3-arm-ccu3-raspi.tar.gz", "browser_download_url": server.URL + "/arm.tar.gz", "digest": digest},
				},
			})
		case "/arm.tar.gz":
			_, _ = w.Write(data)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server
}

func sum(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func updater(server *httptest.Server, dir string) *Updater {
	u := New(server.URL+"/latest", dir)
	u.Arch = "arm"
	return u
}

func TestLatestPicksTheArchiveOfThisPlatform(t *testing.T) {
	data := []byte("archive")
	server := releaseServer(t, data, "sha256:"+sum(data))
	release, err := updater(server, t.TempDir()).Latest()
	if err != nil {
		t.Fatal(err)
	}
	if release.Version != "1.2.3" || release.Asset != "mui-1.2.3-arm-ccu3-raspi.tar.gz" || release.URL != server.URL+"/arm.tar.gz" || release.SHA256 != sum(data) {
		t.Fatalf("unexpected release %+v", release)
	}
}

// Without a checksum nothing is installed, but the version is still known
func TestLatestWithoutChecksum(t *testing.T) {
	server := releaseServer(t, nil, "")
	release, err := updater(server, t.TempDir()).Latest()
	if !errors.Is(err, ErrNoAsset) || release.Version != "1.2.3" {
		t.Fatalf("expected ErrNoAsset with the version, got %+v, %v", release, err)
	}
}

func TestInstallRunsTheUpdateScript(t *testing.T) {
	work := t.TempDir()
	marker := filepath.Join(t.TempDir(), "installed")
	data := archive(t,
		entry{name: "./", typ: tar.TypeDir, mode: 0o755},
		entry{name: "./update_script", mode: 0o777, body: "#!/bin/sh\nset -e\ncat dist/index.html > " + marker + "\n"},
		entry{name: "./dist/index.html", mode: 0o666, body: "new app"},
	)
	u := updater(releaseServer(t, data, "sha256:"+sum(data)), work)
	release, err := u.Latest()
	if err != nil {
		t.Fatal(err)
	}
	if err := u.Install(context.Background(), release, nil); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(marker); string(got) != "new app" {
		t.Fatalf("update_script did not run in the unpacked archive: %q", got)
	}
	// The archive and its unpacked files are removed afterwards
	if left, _ := os.ReadDir(work); len(left) != 0 {
		t.Fatalf("left behind: %v", left)
	}
}

func TestInstallRejectsAWrongChecksum(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "installed")
	data := archive(t, entry{name: "update_script", mode: 0o755, body: "#!/bin/sh\ntouch " + marker + "\n"})
	u := updater(releaseServer(t, data, "sha256:"+sum([]byte("other"))), t.TempDir())
	release, _ := u.Latest()
	if err := u.Install(context.Background(), release, nil); !errors.Is(err, ErrChecksum) {
		t.Fatalf("expected ErrChecksum, got %v", err)
	}
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("update_script ran despite the wrong checksum")
	}
}

func TestInstallReportsAFailingScript(t *testing.T) {
	data := archive(t, entry{name: "update_script", mode: 0o755, body: "#!/bin/sh\necho no room >&2\nexit 2\n"})
	u := updater(releaseServer(t, data, "sha256:"+sum(data)), t.TempDir())
	release, _ := u.Latest()
	err := u.Install(context.Background(), release, nil)
	if !errors.Is(err, ErrScript) || !strings.Contains(err.Error(), "no room") {
		t.Fatalf("expected ErrScript with the script's output, got %v", err)
	}
}

func TestUnpackStaysInsideItsDirectory(t *testing.T) {
	for name, e := range map[string]entry{
		"parent":   {name: "../outside", mode: 0o644, body: "x"},
		"absolute": {name: "/etc/outside", mode: 0o644, body: "x"},
		"symlink":  {name: "link", typ: tar.TypeSymlink},
	} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			file := filepath.Join(dir, "a.tar.gz")
			_ = os.WriteFile(file, archive(t, e), 0o644)
			target := filepath.Join(dir, "unpacked")
			_ = os.Mkdir(target, 0o755)
			if err := unpack(file, target); err == nil {
				t.Fatal("expected the entry to be rejected")
			}
		})
	}
}

// The archive's modes lose group and other write, as with umask 022
func TestUnpackMasksModes(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "a.tar.gz")
	_ = os.WriteFile(file, archive(t, entry{name: "update_script", mode: 0o777, body: "x"}), 0o644)
	target := filepath.Join(dir, "unpacked")
	_ = os.Mkdir(target, 0o755)
	if err := unpack(file, target); err != nil {
		t.Fatal(err)
	}
	stat, _ := os.Stat(filepath.Join(target, "update_script"))
	if stat.Mode().Perm() != 0o755 {
		t.Fatalf("mode = %v", stat.Mode().Perm())
	}
}

func TestOneInstallAtATime(t *testing.T) {
	u := New("http://unused", t.TempDir())
	u.running.Lock()
	defer u.running.Unlock()
	if err := u.Install(context.Background(), Release{URL: "x", SHA256: "y"}, nil); !errors.Is(err, ErrRunning) {
		t.Fatalf("expected ErrRunning, got %v", err)
	}
}

// The app checks on every start: GitHub is asked once, until force
func TestCachedLatestAsksGitHubOnce(t *testing.T) {
	data := []byte("archive")
	asked := 0
	inner := releaseServer(t, data, "sha256:"+sum(data))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked++
		http.Redirect(w, r, inner.URL+r.URL.Path, http.StatusTemporaryRedirect)
	}))
	t.Cleanup(server.Close)
	u := updater(inner, t.TempDir())
	u.ReleaseURL = server.URL + "/latest"
	for range 3 {
		if release, err := u.CachedLatest(false); err != nil || release.Version != "1.2.3" {
			t.Fatalf("unexpected answer %+v, %v", release, err)
		}
	}
	if asked != 1 {
		t.Fatalf("GitHub asked %d times, want 1", asked)
	}
	if _, err := u.CachedLatest(true); err != nil || asked != 2 {
		t.Fatalf("force did not ask again (%d, %v)", asked, err)
	}
}
