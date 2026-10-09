//go:build lite

package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/logger"
	"ccu-addon-mui-server/pkg/occulite"
	"ccu-addon-mui-server/pkg/settings"
	"ccu-addon-mui-server/pkg/types"
	"ccu-addon-mui-server/pkg/websocket"
)

// The capabilities of openccu-lite: no ReGa (programs, system variables,
// alarms, the system protocol, users, channel options, the communication
// test), and occulited has the system settings and installs the add-ons
var liteCapabilities = websocket.Capabilities{}

// newDeviceRPC: on openccu-lite the interface processes are reached through
// occulited's lite-rpc, with the add-on's token for what the server does by
// itself and the user's session for what a user changes (Sebastian in
// #191: the system checks every call, and no subscriber of the add-on's
// own on the eQ-3 processes)
func newDeviceRPC(cfg *config.Config) *ccurpc.Client {
	names := []string{}
	for _, iface := range ccurpc.Interfaces(cfg) {
		names = append(names, iface.Name)
	}
	return ccurpc.NewProxy(cfg.OcculiteURL, names, occulite.New(cfg.OcculiteURL, cfg.OcculiteTokenFile).Token)
}

// setupPlatform connects openccu-lite: occulited's metadata API for the
// home model and its session gate for the login
// (ccu-addon-howto docs/11-openccu-lite.md)
func setupPlatform(ctx context.Context, cfg *config.Config, wsServer *websocket.Server, deviceRPC *ccurpc.Client) (platformHooks, error) {
	// LITE_FORCE: a development system or the tests' fake openccu-lite
	if !occulite.Detect() && os.Getenv("LITE_FORCE") == "" {
		return platformHooks{}, fmt.Errorf("this is no openccu-lite: install the add-on package for CCU3 and OpenCCU")
	}
	client := occulite.New(cfg.OcculiteURL, cfg.OcculiteTokenFile)
	wsServer.SetPlatform(websocket.PlatformLite, liteCapabilities)
	homeModel, err := occulite.NewHome(client, deviceRPC, cfg.DataDir)
	if err != nil {
		return platformHooks{}, fmt.Errorf("reading the add-on's data: %w", err)
	}
	wsServer.SetHome(homeModel)
	// Layouts follow their rooms and functions when they are moved
	homeModel.SetTiles(wsServer.Tiles())
	go homeModel.FollowMeta(ctx)
	// Heating groups through occulited, which names their devices itself
	groups := occulite.NewGroups(client)
	wsServer.SetGroupService(groups)
	wsServer.SetGroupSessions(func(session string) websocket.GroupService { return groups.ForSession(session) })
	// The device pictures (DEVDB.tcl, read from /www as on a CCU) are served
	// by openccu-lite itself, since 1.0.0-dev.45 (hobbyquaker/openccu-lite#10)
	wsServer.SetDeviceImageBase("/config/img/devices/")

	// The gate in front of /addons/ adds the session to the WebSocket
	// upgrade; occulited tells whose it is
	wsServer.SetGate(func(r *http.Request) (websocket.GateSession, error) {
		session, err := client.CheckSession(r.Context(), r.Header.Get(occulite.SessionHeader))
		if errors.Is(err, occulite.ErrNoSession) {
			return websocket.GateSession{}, websocket.ErrNoSession
		}
		if err != nil {
			return websocket.GateSession{}, err
		}
		return websocket.GateSession{
			User: session.User, Level: occulite.AddonLevel(session.Level), Value: session.SID,
			Administrator: session.Level == occulite.LevelAdminister,
		}, nil
	})
	logger.Info("🔒 Authentication: openccu-lite sessions (" + cfg.OcculiteURL + ")")

	// The general settings (energy price, …) are the add-on's own here
	settingsDir := cfg.DataDir
	if settingsDir == "" {
		settingsDir = cfg.ConfigDir
	}
	wsServer.SetSettings(settings.New(settingsDir), cfg.DiagramsDir)

	logger.Info("🪶 openccu-lite " + occulite.Version())
	return platformHooks{
		// lite-rpc's event stream instead of a callback server: it resumes
		// after a break, and the state store gives the values up to then
		events: func(ctx context.Context, handle func(*types.CCUEvent), deviceChanged func(iface, address string)) {
			follow(ctx, client, homeModel, handle, deviceChanged)
		},
	}, nil
}

// follow seeds the values from the state store and follows the event
// stream from the position the store was read at; a resync reads it again
func follow(ctx context.Context, client *occulite.Client, homeModel *occulite.Home, handle func(*types.CCUEvent), deviceChanged func(iface, address string)) {
	seed := func() string {
		for ctx.Err() == nil {
			readCtx, cancel := context.WithTimeout(ctx, time.Minute)
			entries, eventID, err := client.State(readCtx)
			cancel()
			if err == nil {
				homeModel.Seed(entries)
				logger.Info(fmt.Sprintf("🪶 %d values from openccu-lite's state store", len(entries)))
				return eventID
			}
			logger.Error("Reading openccu-lite's state store failed:", err)
			select {
			case <-ctx.Done():
			case <-time.After(10 * time.Second):
			}
		}
		return ""
	}
	lastID := seed()
	for ctx.Err() == nil {
		resync := make(chan struct{}, 1)
		streamCtx, stop := context.WithCancel(ctx)
		go func() {
			select {
			case <-resync:
				stop()
			case <-streamCtx.Done():
			}
		}()
		client.Stream(streamCtx, lastID, func(m occulite.StreamMessage) {
			lastID = m.ID
			switch m.Kind {
			case "event", "state":
				key := m.Data.Key
				if key == "" {
					key = m.Data.Datapoint
				}
				homeModel.OnEvent(m.Data.Address, key, m.Data.Value)
				handle(types.NewCCUEvent(m.Data.Interface, m.Data.Address, key, m.Data.Value))
			case "newDevices", "deleteDevices", "updateDevice", "replaceDevice", "readdedDevice":
				for _, address := range m.Data.Addresses {
					deviceChanged(m.Data.Interface, address)
				}
			case "resync":
				logger.Info("🪶 openccu-lite's event stream lost events (" + m.Data.Reason + "): reading the state store again")
				select {
				case resync <- struct{}{}:
				default:
				}
			}
		})
		stop()
		if ctx.Err() == nil {
			lastID = seed()
		}
	}
}
