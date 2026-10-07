package occulite

import (
	"context"
	"time"

	"ccu-addon-mui-server/pkg/home"
)

// Home is openccu-lite's home model for the add-on: names, rooms and
// functions from the metadata API, values and devices from the interface
// processes
type Home struct {
	unsupported
	client *Client
}

var _ home.Source = (*Home)(nil)

// NewHome returns the home model behind client
func NewHome(client *Client) *Home {
	return &Home{client: client}
}

const callTimeout = 15 * time.Second

func (h *Home) snapshot() (Snapshot, error) {
	ctx, cancel := context.WithTimeout(context.Background(), callTimeout)
	defer cancel()
	return h.client.Snapshot(ctx)
}

// GetDeviceNames returns the names of the devices (refs without ":") by
// address
func (h *Home) GetDeviceNames() (map[string]string, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	for ref, object := range snapshot.Objects {
		_, address, ok := SplitRef(ref)
		if !ok || object.Orphaned || object.Name == "" {
			continue
		}
		names[address] = object.Name
	}
	return names, nil
}
