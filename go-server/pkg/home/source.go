package home

// Source is where the server reads and changes the home model: on a CCU
// the ReGa (pkg/rega), on openccu-lite its metadata and system APIs. What
// exists only on a CCU (system variables, programs, the WebUI's system
// settings) is not part of it.
type Source interface {
	// Rooms and trades, and their channels with names and values
	GetRooms() ([]NamedObject, error)
	GetTrades() ([]NamedObject, error)
	GetChannels(objectID string) ([]Channel, error)
	GetAllChannels() ([]Channel, error)
	// The devices' names by address
	GetDeviceNames() (map[string]string, error)
	// Renames a device or channel; returns SetOK and the previous name, or
	// SetNotFound
	SetName(address, name string) (result, previous string, err error)
	// Rooms and trades ("rooms", "funcs"): create, rename, delete, members
	CreateGroup(list, name string) (result string, id int64, err error)
	RenameGroup(list string, id int64, name string) (result, previous string, err error)
	DeleteGroup(list string, id int64) (result, previous string, err error)
	SetGroupMember(groupID, channelID int64, member bool) (string, error)
	// Sets a datapoint; returns SetOK and the value before, or SetNotFound
	SetDatapoint(interfaceName, address, attribute, value string) (result, previous string, err error)
	// Devices with low battery or unreachable, and the maintenance values
	// of all devices
	GetDeviceProblems() ([]DeviceProblem, error)
	GetDeviceHealth() ([]DeviceHealth, error)
	// Newly paired devices not yet accepted
	GetInbox() ([]InboxDevice, error)
	AcceptDevice(address string) (string, error)
	// The add-on's own data on channels, rooms, trades and favorites
	SetChannelTile(id int64, tile string) (result, name string, err error)
	SetChannelMode(iface, address string, mode int) (string, error)
	GetLayout(id int64) (result, layout string, err error)
	SetLayout(id int64, layout string) (result, name string, err error)
	// Favorite lists of a user
	GetFavorites(username string) ([]Favorite, error)
	ChangeFavorite(change FavoriteChange) (result, value string, err error)
	// Service messages
	GetServiceMessages() ([]ServiceMessage, error)
	AcknowledgeServiceMessage(id int64) (result, messageType string, err error)
	// Channels only administrators may operate, by address
	GetReadOnlyChannels() (map[string]bool, error)
}
