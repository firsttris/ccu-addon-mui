//go:build lite

package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/occulite"
	"ccu-addon-mui-server/pkg/settings"
	"ccu-addon-mui-server/pkg/websocket"
)

// The capabilities of openccu-lite: no ReGa (programs, system variables,
// alarms, the system protocol, users, channel options, the communication
// test), and occulited has the system settings and installs the add-ons
var liteCapabilities = websocket.Capabilities{}

// setupPlatform connects openccu-lite: occulited's metadata API for the
// home model and its session gate for the login
// (ccu-addon-howto docs/11-openccu-lite.md)
func setupPlatform(ctx context.Context, cfg *config.Config, wsServer *websocket.Server, _ *ccurpc.Client) (platformHooks, error) {
	// LITE_FORCE: a development system or the tests' fake openccu-lite
	if !occulite.Detect() && os.Getenv("LITE_FORCE") == "" {
		return platformHooks{}, fmt.Errorf("this is no openccu-lite: install the add-on package for CCU3 and OpenCCU")
	}
	client := occulite.New(cfg.OcculiteURL, cfg.OcculiteTokenFile)
	wsServer.SetPlatform(websocket.PlatformLite, liteCapabilities)
	wsServer.SetHome(occulite.NewHome(client))

	// The gate in front of /addons/ adds the session to the WebSocket
	// upgrade; occulited tells whose it is
	wsServer.SetGate(func(r *http.Request) (websocket.GateSession, bool) {
		session, ok := client.CheckSession(r.Context(), r.Header.Get(occulite.SessionHeader))
		if !ok {
			return websocket.GateSession{}, false
		}
		return websocket.GateSession{User: session.User, Level: occulite.AddonLevel(session.Level)}, true
	})
	logger.Info("🔒 Authentication: openccu-lite sessions (" + cfg.OcculiteURL + ")")

	// The general settings (energy price, …) are the add-on's own here
	settingsDir := cfg.DataDir
	if settingsDir == "" {
		settingsDir = cfg.ConfigDir
	}
	wsServer.SetSettings(settings.New(settingsDir), cfg.DiagramsDir)

	logger.Info("🪶 openccu-lite " + occulite.Version())
	return platformHooks{}, nil
}
