package fakeccu

import (
	"encoding/json"
	"fmt"
	"os"
)

// Fixture is the state of a CCU: the ReGa objects the add-on reads (rooms,
// trades, channels with their datapoints, users) and, per interface, what
// XML-RPC returns (device descriptions, paramset descriptions, paramsets).
// cmd/ccu-export writes it from a real CCU.
type Fixture struct {
	Rooms  []Group `json:"rooms"`
	Trades []Group `json:"trades"`
	Users  []User  `json:"users"`
	// Channels as ReGa knows them, including the maintenance channels
	// (":0") that report UNREACH and LOW_BAT.
	Channels []Channel `json:"channels"`
	// DeviceNames by device address, for the device problem list
	Sysvars     []Sysvar          `json:"sysvars,omitempty"`
	Programs    []Program         `json:"programs,omitempty"`
	DeviceNames map[string]string `json:"deviceNames,omitempty"`
	// Inbox holds the addresses of paired devices not yet accepted
	Inbox      []string                  `json:"inbox,omitempty"`
	Interfaces map[string]*InterfaceData `json:"interfaces,omitempty"`
}

// Sysvar is a system variable as ReGa describes it.
type Sysvar struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Visible bool   `json:"visible"`
	// ValueType and SubType as ReGa numbers them (2/2 bool, 2/6 alarm,
	// 4/0 number, 16/29 enum, 20/11 string)
	ValueType int         `json:"valueType"`
	SubType   int         `json:"subType"`
	Unit      string      `json:"unit,omitempty"`
	Min       string      `json:"min,omitempty"`
	Max       string      `json:"max,omitempty"`
	FalseName string      `json:"falseName,omitempty"`
	TrueName  string      `json:"trueName,omitempty"`
	ValueList string      `json:"valueList,omitempty"`
	Value     interface{} `json:"value"`
}

type Program struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Active  bool   `json:"active"`
	Visible bool   `json:"visible"`
	// Runs counts how often the program was run (not part of ReGa)
	Runs int `json:"runs,omitempty"`
}

// Group is a room or trade with the ReGa ids of its channels.
type Group struct {
	ID       int64   `json:"id"`
	Name     string  `json:"name"`
	Channels []int64 `json:"channels"`
}

type User struct {
	Name     string `json:"name"`
	Password string `json:"password"`
	// Level as ReGa stores it: 1 = guest, 2 = user, 8 = admin
	Level int `json:"level"`
}

type Channel struct {
	ID        int64  `json:"id"`
	Address   string `json:"address"`
	Type      string `json:"type"`
	Interface string `json:"interface"`
	Name      string `json:"name"`
	// Datapoints by name; values are bool, number, string or null
	Datapoints map[string]interface{} `json:"datapoints"`
}

// InterfaceData is what an XML-RPC interface (e.g. HmIP-RF) returns.
type InterfaceData struct {
	// Devices are device and channel descriptions as listDevices returns
	// them (ADDRESS, TYPE, PARENT, PARAMSETS, ...).
	Devices []map[string]interface{} `json:"devices"`
	// ParamsetDescriptions by address and paramset key
	ParamsetDescriptions map[string]map[string]map[string]interface{} `json:"paramsetDescriptions,omitempty"`
	// Paramsets (MASTER values) by address and paramset key. VALUES are
	// taken from the ReGa datapoints, so both stay in sync. Link
	// parameters are keyed by the partner's address; their description is
	// the "LINK" entry of ParamsetDescriptions.
	Paramsets map[string]map[string]map[string]interface{} `json:"paramsets,omitempty"`
	// Links as getLinks returns them (SENDER, RECEIVER, NAME, DESCRIPTION)
	Links []map[string]interface{} `json:"links,omitempty"`
}

// LoadFixture reads a fixture from a JSON file.
func LoadFixture(path string) (*Fixture, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var fixture Fixture
	if err := json.Unmarshal(data, &fixture); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return &fixture, nil
}
