package fakeccu

import (
	"encoding/json"
	"fmt"
	"os"

	"ccu-addon-mui-server/pkg/rega"
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
	Inbox []string `json:"inbox,omitempty"`
	// Favorites are the favorite lists; Items hold channel, sysvar and
	// program ids
	Favorites  []Favorite                `json:"favorites,omitempty"`
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
	// Alarm variables: how often and when last triggered; an alarm with a
	// counter is an alarm message until acknowledged
	AlarmCounter int    `json:"alarmCounter,omitempty"`
	AlarmTime    string `json:"alarmTime,omitempty"`
	receipted    bool
}

type Program struct {
	ID      int64  `json:"id"`
	Name    string `json:"name"`
	Active  bool   `json:"active"`
	Visible bool   `json:"visible"`
	// Runs counts how often the program was run (not part of ReGa)
	Runs        int    `json:"runs,omitempty"`
	Description string `json:"description,omitempty"`
	// The program's rules, as the program editor reads and writes them
	Rules []rega.ProgramRule  `json:"rules,omitempty"`
	Else  *rega.ProgramBranch `json:"else,omitempty"`
}

// Group is a room or trade with the ReGa ids of its channels.
type Group struct {
	ID       int64   `json:"id"`
	Name     string  `json:"name"`
	Channels []int64 `json:"channels"`
}

// Favorite is a favorite list and the users who see it (the WebUI's
// "_USER<id>" objects).
type Favorite struct {
	ID    int64    `json:"id"`
	Name  string   `json:"name"`
	Users []string `json:"users"`
	Items []int64  `json:"items"`
}

type User struct {
	// ReGa id; 1001 onwards in fixture order when not given
	ID       int64  `json:"id,omitempty"`
	Name     string `json:"name"`
	Password string `json:"password"`
	// Level as ReGa stores it: 1 = guest, 2 = user, 8 = admin
	Level     int    `json:"level"`
	FirstName string `json:"firstName,omitempty"`
	LastName  string `json:"lastName,omitempty"`
	ShowLogin bool   `json:"showLogin,omitempty"`
	Mail      string `json:"mail,omitempty"`
	Phone     string `json:"phone,omitempty"`
}

type Channel struct {
	ID        int64  `json:"id"`
	Address   string `json:"address"`
	Type      string `json:"type"`
	Interface string `json:"interface"`
	Name      string `json:"name"`
	// Datapoints by name; values are bool, number, string or null
	Datapoints map[string]interface{} `json:"datapoints"`
	// Tile is the tile chosen in the add-on (ReGa metadata "muiTile")
	Tile string `json:"tile,omitempty"`
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
	// RadioInterfaces as listBidcosInterfaces returns them; without, the
	// interface doesn't support the call
	RadioInterfaces []map[string]interface{} `json:"radioInterfaces,omitempty"`
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
