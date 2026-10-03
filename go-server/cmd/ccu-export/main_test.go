package main

import (
	"fmt"
	"testing"

	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/fakeccu"
)

// Exporting the fake CCU must give back the fixture it was started with.
func TestExportRoundTrip(t *testing.T) {
	original, err := fakeccu.LoadFixture("../../../fixtures/demo-ccu.json")
	if err != nil {
		t.Fatal(err)
	}
	source, _ := fakeccu.LoadFixture("../../../fixtures/demo-ccu.json")
	ccu := fakeccu.New(source)
	if err := ccu.Start("127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	defer ccu.Close()

	exported, err := export(&config.Config{
		CCUHost:            "127.0.0.1",
		RegaPort:           ccu.RegaPort,
		RPCPort:            ccu.InterfacePorts["BidCos-RF"],
		HmIPPort:           ccu.InterfacePorts["HmIP-RF"],
		VirtualDevicesPort: ccu.InterfacePorts["VirtualDevices"],
	}, true)
	if err != nil {
		t.Fatal(err)
	}

	if len(exported.Rooms) != len(original.Rooms) || len(exported.Trades) != len(original.Trades) {
		t.Fatalf("rooms/trades: got %d/%d", len(exported.Rooms), len(exported.Trades))
	}
	for i, room := range original.Rooms {
		if exported.Rooms[i].Name != room.Name || len(exported.Rooms[i].Channels) != len(room.Channels) {
			t.Errorf("room %d: got %+v, want %+v", i, exported.Rooms[i], room)
		}
	}

	byAddress := map[string]fakeccu.Channel{}
	for _, ch := range exported.Channels {
		byAddress[ch.Address] = ch
	}
	for _, want := range original.Channels {
		got, ok := byAddress[want.Address]
		if !ok {
			t.Errorf("channel %s missing", want.Address)
			continue
		}
		if want.Type == "MAINTENANCE" {
			// Only the status datapoints are known through ReGa
			if got.Datapoints["UNREACH"] != want.Datapoints["UNREACH"] {
				t.Errorf("%s: UNREACH %v, want %v", want.Address, got.Datapoints["UNREACH"], want.Datapoints["UNREACH"])
			}
			continue
		}
		if got.Name != want.Name || got.Type != want.Type || got.Interface != want.Interface || len(got.Datapoints) != len(want.Datapoints) {
			t.Errorf("%s: got %+v, want %+v", want.Address, got, want)
		}
	}

	hmip := exported.Interfaces["HmIP-RF"]
	if hmip == nil || len(hmip.Devices) != 9 || hmip.ParamsetDescriptions["0000DBE9A5C1F2:1"]["VALUES"] == nil ||
		fmt.Sprint(hmip.Paramsets["0000DBE9A5C1F2:1"]["MASTER"]["EVENT_DELAY_UNIT"]) != "0" {
		t.Fatalf("unexpected HmIP-RF data: %+v", hmip)
	}
	if exported.DeviceNames["000A9D89A7AF25"] != "Wandthermostat Flur" {
		t.Errorf("device names: %v", exported.DeviceNames)
	}

	anonymizeNames(exported)
	if exported.Rooms[0].Name != "Raum 1" || byAddress["LEQ0000001:1"].Name == exported.Channels[1].Name {
		t.Errorf("names not anonymized: %v %v", exported.Rooms[0].Name, exported.Channels[1].Name)
	}
}
