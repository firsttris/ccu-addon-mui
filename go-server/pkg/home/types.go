// Package home holds what the add-on knows about the home: rooms, trades,
// channels with their names and values, favorites, service messages. The
// CCU's ReGa (pkg/rega) and openccu-lite's APIs both provide it.
package home

// Results of a change
const (
	SetOK       = "OK"
	SetNotFound = "NOT_FOUND"
	// The platform cannot make this change (openccu-lite)
	SetNotSupported = "NOT_SUPPORTED"
)

// NamedObject is a room or a trade.
type NamedObject struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type Channel struct {
	ID            int64                  `json:"id"`
	Address       string                 `json:"address"`
	Name          string                 `json:"name"`
	Type          string                 `json:"type"`
	InterfaceName string                 `json:"interfaceName"`
	Datapoints    map[string]interface{} `json:"datapoints"`

	// StatusAddress is the device's maintenance channel (":0"), which
	// reports Status (LOW_BAT, UNREACH) and sends the events for it.
	StatusAddress string          `json:"statusAddress,omitempty"`
	Status        map[string]bool `json:"status,omitempty"`

	// Rooms and Trades are the ids of the rooms and trades the channel
	// belongs to.
	Rooms  []int64 `json:"rooms,omitempty"`
	Trades []int64 `json:"trades,omitempty"`

	// Tile is the tile chosen for the channel in the add-on ("light" or
	// "switch"), filled in by the server from mui-tiles.json; empty lets
	// the app decide.
	Tile string `json:"tile,omitempty"`

	// Mode is what an input channel (MULTI_MODE_INPUT_TRANSMITTER) is wired
	// to, as the WebUI stores it (metadata "channelMode"): 0 off, 1 key,
	// 2 switch, 3 contact, 4 level, 5 condition (translate.lang.
	// channelDescription.js); nil when not set, which means key.
	Mode *int `json:"mode,omitempty"`

	// The WebUI's channel options: Hidden (not visible), ReadOnly (not
	// usable by non-administrators), Logged (in the system protocol)
	Hidden   bool `json:"hidden,omitempty"`
	ReadOnly bool `json:"readOnly,omitempty"`
	Logged   bool `json:"logged,omitempty"`
	// Secured transmission (AES), the WebUI's "Übertragungsmodus"
	AES bool `json:"aes,omitempty"`
}

type DeviceProblem struct {
	Address  string `json:"address"`
	Name     string `json:"name"`
	RoomID   int64  `json:"roomId,omitempty"`
	RoomName string `json:"roomName,omitempty"`
	LowBat   bool   `json:"lowBat"`
	Unreach  bool   `json:"unreach"`
}

// InboxDevice is a paired device not yet accepted in the CCU.
type InboxDevice struct {
	Address       string `json:"address"`
	Type          string `json:"type"`
	InterfaceName string `json:"interfaceName"`
	Name          string `json:"name"`
}

// Favorite is a favorite list of the CCU, as the WebUI shows them under
// "Favoriten": channels, system variables and programs from any room.
type Favorite struct {
	ID    int64          `json:"id"`
	Name  string         `json:"name"`
	Items []FavoriteItem `json:"items"`
}

// FavoriteItem is an entry of a favorite list, in list order.
type FavoriteItem struct {
	ID int64 `json:"id"`
	// CHANNEL, SYSVAR, PROGRAM or SEPARATOR
	Type string `json:"type"`
}

// FavoriteChange is a change of a favorite list.
type FavoriteChange struct {
	Action string
	// The list (all but create) and the channel, system variable or
	// program (add, remove)
	ListID int64
	ItemID int64
	// The name (create, rename)
	Name string
	// The user a new list is for; all users if empty
	Username string
}

// Changes to favorite lists, see favorite_change.tcl
const (
	FavoriteCreate = "create"
	FavoriteRename = "rename"
	FavoriteDelete = "delete"
	FavoriteAdd    = "add"
	FavoriteRemove = "remove"
)

// ServiceMessage is an active service message of the CCU, as the WebUI
// lists them under "Servicemeldungen".
type ServiceMessage struct {
	ID int64 `json:"id"`
	// The datapoint that raised it: UNREACH, STICKY_UNREACH, LOW_BAT,
	// CONFIG_PENDING, SABOTAGE, ERROR_CODE, ...
	Type string `json:"type"`
	// The datapoint's value, e.g. the error code
	Value     string `json:"value,omitempty"`
	Timestamp string `json:"timestamp,omitempty"`
	Address   string `json:"address,omitempty"`
	Name      string `json:"name"`
	RoomID    int64  `json:"roomId,omitempty"`
	RoomName  string `json:"roomName,omitempty"`
}

// DeviceHealth is what a device's maintenance channel tells about it
// (get_device_health.tcl)
type DeviceHealth struct {
	Address   string `json:"address"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Interface string `json:"interfaceName"`
	RoomID    int64  `json:"roomId,omitempty"`
	RoomName  string `json:"roomName,omitempty"`
	// The values by datapoint (LOW_BAT for LOWBAT too)
	Values map[string]HealthValue `json:"values"`
}

// HealthValue is a value with the time it was last set (Unix seconds, 0 if
// never)
type HealthValue struct {
	Value interface{} `json:"value"`
	Time  int64       `json:"time,omitempty"`
}

// VirtualKey is a virtual key of the central (a channel of its HM-RCV-50
// or HmIP-RCV-50)
type VirtualKey struct {
	ID            int64  `json:"id"`
	Address       string `json:"address"`
	InterfaceName string `json:"interfaceName"`
	Name          string `json:"name"`
	// How many programs use the key
	Programs int `json:"programs"`
}
