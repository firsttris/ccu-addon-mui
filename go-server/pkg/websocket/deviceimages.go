package websocket

import (
	"net/http"
	"path/filepath"
	"sync"

	"ccu-addon-mui-server/pkg/devimages"
	"ccu-addon-mui-server/pkg/logger"
)

// DeviceImagePath serves the WebUI's device pictures (www/config/img/
// devices), next to the WebSocket so that the app reaches them through
// the same proxy in development as on the CCU
const DeviceImagePath = "/ws/mui/img/"

type deviceImagesResponse struct {
	Type      string                     `json:"type"`
	RequestID string                     `json:"requestId,omitempty"`
	Images    map[string]devimages.Image `json:"images"`
}

var (
	deviceImagesOnce sync.Once
	deviceImages     map[string]devimages.Image
)

// loadDeviceImages reads DEVDB.tcl once; it only changes with the firmware
func (s *Server) loadDeviceImages() map[string]devimages.Image {
	deviceImagesOnce.Do(func() {
		images, err := devimages.Load(s.cfg.WWWDir)
		if err != nil {
			logger.Info("Device pictures not available: " + err.Error())
			images = map[string]devimages.Image{}
		}
		deviceImages = images
	})
	return deviceImages
}

// handleDeviceImages sends the picture and channel marks of every device
// type (lower case), as the WebUI's DEVDB.tcl lists them
func (s *Server) handleDeviceImages(client *Client, requestID string) {
	s.sendJSON(client, deviceImagesResponse{Type: "getDeviceImages_response", RequestID: requestID, Images: s.loadDeviceImages()})
}

// deviceImageHandler serves the picture files; the WebUI shows them
// without login too
func (s *Server) deviceImageHandler() http.Handler {
	files := http.StripPrefix(DeviceImagePath, http.FileServer(http.Dir(filepath.Join(s.cfg.WWWDir, "config", "img", "devices"))))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// No directory listings
		if r.URL.Path == "" || r.URL.Path[len(r.URL.Path)-1] == '/' {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=86400")
		files.ServeHTTP(w, r)
	})
}
