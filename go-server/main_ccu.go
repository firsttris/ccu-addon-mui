//go:build !lite

package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"ccu-addon-mui-server/pkg/addons"
	"ccu-addon-mui-server/pkg/auth"
	"ccu-addon-mui-server/pkg/backup"
	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/logs"
	"ccu-addon-mui-server/pkg/occulite"
	"ccu-addon-mui-server/pkg/rega"
	"ccu-addon-mui-server/pkg/selfupdate"
	"ccu-addon-mui-server/pkg/settings"
	"ccu-addon-mui-server/pkg/websocket"
)

// newDeviceRPC: a CCU's interface processes answer XML-RPC on their ports
func newDeviceRPC(cfg *config.Config) *ccurpc.Client {
	return ccurpc.New(cfg)
}

// setupPlatform connects a CCU3 or OpenCCU: the ReGa for the home model,
// programs and system variables, the CCU's users for the login, and the
// WebUI's system settings
func setupPlatform(ctx context.Context, cfg *config.Config, wsServer *websocket.Server, _ *ccurpc.Client) (platformHooks, error) {
	if occulite.Detect() {
		return platformHooks{}, fmt.Errorf("this is openccu-lite: install the add-on package for openccu-lite (mui-…-lite.tar.gz)")
	}

	regaClient := rega.NewClient(cfg)
	wsServer.SetRega(regaClient)

	switch cfg.AuthMode {
	case "ccu":
		authenticator, err := auth.New(cfg.WebUIURL, cfg.AuthKeyFile)
		if err != nil {
			// Fail closed: without the key nobody could log in, and running
			// without authentication would expose all devices.
			return platformHooks{}, fmt.Errorf("failed to initialise authentication: %w", err)
		}
		if err := authenticator.EnableSessions(cfg.SessionsFile); err != nil {
			return platformHooks{}, fmt.Errorf("failed to load the logged-in devices: %w", err)
		}
		authenticator.SetLevelFunc(func(username string) (string, error) {
			level, err := regaClient.GetUserLevel(username)
			if errors.Is(err, rega.ErrUnknownUser) {
				// Deleted in the WebUI: no rights any more
				return auth.LevelUnknown, nil
			}
			if err != nil {
				logger.Infof("⚠️ Could not read the user level of %q: %v", username, err)
				return auth.LevelUnknown, err
			}
			return auth.LevelFromCCU(level), nil
		})
		wsServer.SetAuthenticator(authenticator)
		logger.Info("🔒 Authentication: CCU users (" + cfg.WebUIURL + ")")
	case "none":
		logger.Info("⚠️ Authentication disabled (AUTH_MODE=none): everyone on the network can control all devices")
	default:
		return platformHooks{}, fmt.Errorf("invalid AUTH_MODE %q, expected \"ccu\" or \"none\"", cfg.AuthMode)
	}

	wsServer.SetBackup(backup.New(cfg.WebUIURL, cfg.BackupDir, cfg.FirmwareUploadDir))
	// The add-ons; this one's rc.d script is "mui" (addon_installer/rc.d)
	wsServer.SetAddons(addons.New(cfg.AddonsDir, "mui", cfg.WebUIURL))
	wsServer.SetSelfUpdate(selfupdate.New(cfg.AddonReleaseURL, cfg.AddonUpdateDir))
	wsServer.SetLogs(logs.New(cfg.SyslogConfig, cfg.LogDir))
	settings.StatusDir = cfg.StatusDir
	wsServer.SetSettings(settings.New(cfg.ConfigDir), cfg.DiagramsDir)

	// System variables send no events: read once for all apps that show them
	sysvarInterval := cfg.SysvarInterval
	if sysvarInterval <= 0 {
		sysvarInterval = 5 * time.Second
	}
	go wsServer.RunSysvarWatch(ctx, sysvarInterval)

	return platformHooks{
		// Diagrams of system variables
		recordDiagrams: func(ctx context.Context) { go wsServer.RunSysvarRecording(ctx, time.Minute) },
		start: func() {
			if err := regaClient.TestConnection(); err != nil {
				logger.Error("CCU connection test failed:", err)
			}
		},
	}, nil
}
