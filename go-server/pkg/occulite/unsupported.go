package occulite

import "ccu-addon-mui-server/pkg/home"

// unsupported answers every part of home.Source with ErrNotSupported; Home
// overrides what openccu-lite has
type unsupported struct{}

func (unsupported) GetRooms() ([]home.NamedObject, error)      { return nil, home.ErrNotSupported }
func (unsupported) GetTrades() ([]home.NamedObject, error)     { return nil, home.ErrNotSupported }
func (unsupported) GetChannels(string) ([]home.Channel, error) { return nil, home.ErrNotSupported }
func (unsupported) GetAllChannels() ([]home.Channel, error)    { return nil, home.ErrNotSupported }
func (unsupported) GetDeviceNames() (map[string]string, error) { return nil, home.ErrNotSupported }
func (unsupported) SetName(string, string) (string, string, error) {
	return "", "", home.ErrNotSupported
}
func (unsupported) CreateGroup(string, string) (string, int64, error) {
	return "", 0, home.ErrNotSupported
}
func (unsupported) RenameGroup(string, int64, string) (string, string, error) {
	return "", "", home.ErrNotSupported
}
func (unsupported) DeleteGroup(string, int64) (string, string, error) {
	return "", "", home.ErrNotSupported
}
func (unsupported) SetGroupMember(int64, int64, bool) (string, error) {
	return "", home.ErrNotSupported
}
func (unsupported) SetDatapoint(string, string, string, string) (string, string, error) {
	return "", "", home.ErrNotSupported
}
func (unsupported) GetDeviceProblems() ([]home.DeviceProblem, error) {
	return nil, home.ErrNotSupported
}
func (unsupported) GetDeviceHealth() ([]home.DeviceHealth, error) { return nil, home.ErrNotSupported }
func (unsupported) GetInbox() ([]home.InboxDevice, error)         { return nil, home.ErrNotSupported }
func (unsupported) AcceptDevice(string) (string, error)           { return "", home.ErrNotSupported }
func (unsupported) SetChannelTile(int64, string) (string, string, error) {
	return "", "", home.ErrNotSupported
}
func (unsupported) SetChannelMode(string, string, int) (string, error) {
	return "", home.ErrNotSupported
}
func (unsupported) GetLayout(int64) (string, string, error) { return "", "", home.ErrNotSupported }
func (unsupported) SetLayout(int64, string) (string, string, error) {
	return "", "", home.ErrNotSupported
}
func (unsupported) GetFavorites(string) ([]home.Favorite, error) { return nil, home.ErrNotSupported }
func (unsupported) ChangeFavorite(home.FavoriteChange) (string, string, error) {
	return "", "", home.ErrNotSupported
}
func (unsupported) GetServiceMessages() ([]home.ServiceMessage, error) {
	return nil, home.ErrNotSupported
}
func (unsupported) AcknowledgeServiceMessage(int64) (string, string, error) {
	return "", "", home.ErrNotSupported
}
func (unsupported) GetReadOnlyChannels() (map[string]bool, error) { return map[string]bool{}, nil }
