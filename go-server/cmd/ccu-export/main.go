// Command ccu-export reads a real CCU and writes a fixture for the fake CCU
// (pkg/fakeccu): rooms, trades, channels with their values, and per
// interface the device and paramset descriptions. It only reads.
//
//	CCU_HOST=192.168.178.26 go run ./cmd/ccu-export -o ../fixtures/my-ccu.json -anonymize
//
// Passwords can't be exported; the fixture gets the user Admin/secret.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"
	"strconv"
	"strings"

	"ccu-addon-mui-server/pkg/ccurpc"
	"ccu-addon-mui-server/pkg/config"
	"ccu-addon-mui-server/pkg/fakeccu"
	"ccu-addon-mui-server/pkg/rega"
)

func main() {
	output := flag.String("o", "ccu-fixture.json", "output file")
	anonymize := flag.Bool("anonymize", false, "replace names of rooms, trades and devices")
	skipRPC := flag.Bool("skip-rpc", false, "only export ReGa data, no device descriptions")
	flag.Parse()

	cfg := config.Load()
	fixture, err := export(cfg, !*skipRPC)
	if err != nil {
		log.Fatal(err)
	}
	if *anonymize {
		anonymizeNames(fixture)
	}

	data, err := json.MarshalIndent(fixture, "", "  ")
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile(*output, append(data, '\n'), 0o644); err != nil {
		log.Fatal(err)
	}
	log.Printf("Wrote %s: %d rooms, %d trades, %d channels", *output, len(fixture.Rooms), len(fixture.Trades), len(fixture.Channels))
}

func export(cfg *config.Config, withRPC bool) (*fakeccu.Fixture, error) {
	regaClient := rega.NewClient(cfg)
	fixture := &fakeccu.Fixture{
		Users:       []fakeccu.User{{Name: "Admin", Password: "secret", Level: 8}},
		DeviceNames: map[string]string{},
		Interfaces:  map[string]*fakeccu.InterfaceData{},
	}

	channels := map[string]*fakeccu.Channel{}
	var order []string
	add := func(ch rega.Channel) {
		if _, ok := channels[ch.Address]; !ok {
			channels[ch.Address] = &fakeccu.Channel{
				ID: ch.ID, Address: ch.Address, Type: ch.Type, Interface: ch.InterfaceName,
				Name: ch.Name, Datapoints: ch.Datapoints,
			}
			order = append(order, ch.Address)
		}
		// ReGa only reports the maintenance channel as status of the others
		if ch.StatusAddress != "" {
			if _, ok := channels[ch.StatusAddress]; !ok {
				datapoints := map[string]interface{}{}
				for k, v := range ch.Status {
					datapoints[k] = v
				}
				channels[ch.StatusAddress] = &fakeccu.Channel{
					ID: int64(1_000_000 + len(order)), Address: ch.StatusAddress, Type: "MAINTENANCE",
					Interface: ch.InterfaceName, Name: ch.StatusAddress, Datapoints: datapoints,
				}
				order = append(order, ch.StatusAddress)
			}
		}
	}

	groups := func(objects []rega.NamedObject) ([]fakeccu.Group, error) {
		var result []fakeccu.Group
		for _, object := range objects {
			members, err := regaClient.GetChannels(strconv.FormatInt(object.ID, 10))
			if err != nil {
				return nil, err
			}
			group := fakeccu.Group{ID: object.ID, Name: object.Name, Channels: []int64{}}
			for _, ch := range members {
				add(ch)
				group.Channels = append(group.Channels, ch.ID)
			}
			result = append(result, group)
		}
		return result, nil
	}

	rooms, err := regaClient.GetRooms()
	if err != nil {
		return nil, fmt.Errorf("rooms: %w", err)
	}
	if fixture.Rooms, err = groups(rooms); err != nil {
		return nil, fmt.Errorf("room channels: %w", err)
	}
	trades, err := regaClient.GetTrades()
	if err != nil {
		return nil, fmt.Errorf("trades: %w", err)
	}
	if fixture.Trades, err = groups(trades); err != nil {
		return nil, fmt.Errorf("trade channels: %w", err)
	}
	all, err := regaClient.GetAllChannels()
	if err != nil {
		return nil, fmt.Errorf("all channels: %w", err)
	}
	for _, ch := range all {
		add(ch)
	}
	for _, address := range order {
		fixture.Channels = append(fixture.Channels, *channels[address])
	}

	problems, err := regaClient.GetDeviceProblems()
	if err != nil {
		return nil, fmt.Errorf("device problems: %w", err)
	}
	for _, p := range problems {
		fixture.DeviceNames[p.Address] = p.Name
	}

	if withRPC {
		rpc, err := ccurpc.New(cfg)
		if err != nil {
			return nil, err
		}
		for _, iface := range ccurpc.Interfaces(cfg) {
			data, err := exportInterface(rpc, iface.Name)
			if err != nil {
				log.Printf("Skipping %s: %v", iface.Name, err)
				continue
			}
			fixture.Interfaces[iface.Name] = data
		}
	}
	return fixture, nil
}

func exportInterface(rpc *ccurpc.Client, iface string) (*fakeccu.InterfaceData, error) {
	reply, err := rpc.CallRaw(iface, "listDevices")
	if err != nil {
		return nil, err
	}
	list, _ := reply.([]interface{})
	data := &fakeccu.InterfaceData{
		ParamsetDescriptions: map[string]map[string]map[string]interface{}{},
		Paramsets:            map[string]map[string]map[string]interface{}{},
	}
	for _, raw := range list {
		device, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		data.Devices = append(data.Devices, device)
		address, _ := device["ADDRESS"].(string)
		paramsets, _ := device["PARAMSETS"].([]interface{})
		for _, p := range paramsets {
			key, _ := p.(string)
			if key != ccurpc.ParamsetValues && key != ccurpc.ParamsetMaster {
				continue
			}
			description, err := rpc.CallRaw(iface, "getParamsetDescription", address, key)
			if err != nil {
				log.Printf("%s %s %s: %v", iface, address, key, err)
				continue
			}
			if m, ok := description.(map[string]interface{}); ok {
				if data.ParamsetDescriptions[address] == nil {
					data.ParamsetDescriptions[address] = map[string]map[string]interface{}{}
				}
				data.ParamsetDescriptions[address][key] = m
			}
			// VALUES come from ReGa; MASTER (the settings) only from here
			if key == ccurpc.ParamsetMaster {
				values, err := rpc.CallRaw(iface, "getParamset", address, key)
				if m, ok := values.(map[string]interface{}); ok && err == nil {
					if data.Paramsets[address] == nil {
						data.Paramsets[address] = map[string]map[string]interface{}{}
					}
					data.Paramsets[address][key] = m
				}
			}
		}
	}
	log.Printf("%s: %d devices and channels", iface, len(data.Devices))
	return data, nil
}

// anonymizeNames replaces all names with neutral ones built from the
// channel type, keeping the structure.
func anonymizeNames(fixture *fakeccu.Fixture) {
	for i := range fixture.Rooms {
		fixture.Rooms[i].Name = fmt.Sprintf("Raum %d", i+1)
	}
	for i := range fixture.Trades {
		fixture.Trades[i].Name = fmt.Sprintf("Gewerk %d", i+1)
	}
	counts := map[string]int{}
	for i := range fixture.Channels {
		ch := &fixture.Channels[i]
		counts[ch.Type]++
		ch.Name = fmt.Sprintf("%s %d", strings.ReplaceAll(strings.ToLower(ch.Type), "_", " "), counts[ch.Type])
	}
	devices := make([]string, 0, len(fixture.DeviceNames))
	for address := range fixture.DeviceNames {
		devices = append(devices, address)
	}
	sort.Strings(devices)
	for i, address := range devices {
		fixture.DeviceNames[address] = fmt.Sprintf("Gerät %d", i+1)
	}
}
