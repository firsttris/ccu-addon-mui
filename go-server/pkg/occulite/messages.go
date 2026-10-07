package occulite

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"ccu-addon-mui-server/pkg/home"
)

// liteServiceMessage is one of occulited's service messages
// (GET /api/system/v1/service-messages): an active maintenance datapoint
// on a device's channel 0
type liteServiceMessage struct {
	Interface string      `json:"interface"`
	Address   string      `json:"address"`
	Channel   string      `json:"channel"`
	Key       string      `json:"key"`
	Value     interface{} `json:"value"`
	Since     string      `json:"since"`
	Name      string      `json:"name"`
}

// roomOf is the first room of a device (its object, else its first
// channel's), for the message lists
func roomOf(snapshot Snapshot, iface, device string) (int64, string) {
	names := map[string]string{}
	if enum, ok := snapshot.Enums["room"]; ok {
		enum.Walk("room", func(path string, node Node, depth int) { names[path] = node.Name })
	}
	refs := []string{Ref(iface, device)}
	for ref := range snapshot.Objects {
		if strings.HasPrefix(ref, Ref(iface, device)+":") {
			refs = append(refs, ref)
		}
	}
	sort.Strings(refs)
	for _, ref := range refs {
		for _, path := range snapshot.Objects[ref].Enums {
			if name, ok := names[path]; ok {
				return ID(path), name
			}
		}
	}
	return 0, ""
}

// deviceName is a device's name, else its address
func deviceName(snapshot Snapshot, iface, device string) string {
	if object, ok := snapshot.Objects[Ref(iface, device)]; ok && object.Name != "" {
		return object.Name
	}
	return device
}

func (h *Home) serviceMessages() ([]liteServiceMessage, error) {
	ctx, cancel := h.context()
	defer cancel()
	var answer struct {
		Messages []liteServiceMessage `json:"messages"`
	}
	err := h.client.do(ctx, http.MethodGet, "/api/system/v1/service-messages", "", nil, &answer)
	return answer.Messages, err
}

// GetServiceMessages are the service messages occulited collects, by the
// CCU's own rule (the maintenance datapoints with the service flag)
func (h *Home) GetServiceMessages() ([]home.ServiceMessage, error) {
	messages, err := h.serviceMessages()
	if err != nil {
		return nil, err
	}
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	list := []home.ServiceMessage{}
	for _, m := range messages {
		device, _, _ := strings.Cut(m.Address, ":")
		roomID, roomName := roomOf(snapshot, m.Interface, device)
		name := m.Name
		if name == "" {
			name = deviceName(snapshot, m.Interface, device)
		}
		list = append(list, home.ServiceMessage{
			ID: ID(m.Interface + "." + m.Channel + "." + m.Key), Type: m.Key, Value: formatValue(m.Value),
			Timestamp: wallClock(m.Since), Address: device, Name: name, RoomID: roomID, RoomName: roomName,
		})
	}
	return list, nil
}

// AcknowledgeServiceMessage ends a sticky message (STICKY_UNREACH,
// STICKY_SABOTAGE) by setting it false on the device, as the CCU does. The
// others end when the device reports otherwise: occulited's messages are
// read-only (docs/system-api.md, GET /service-messages), so they answer
// NOT_SUPPORTED, and the app offers no acknowledging for them.
func (h *Home) AcknowledgeServiceMessage(id int64) (string, string, error) {
	messages, err := h.serviceMessages()
	if err != nil {
		return "", "", err
	}
	for _, m := range messages {
		if ID(m.Interface+"."+m.Channel+"."+m.Key) != id {
			continue
		}
		if !strings.HasPrefix(m.Key, "STICKY_") {
			return home.SetNotSupported, m.Key, nil
		}
		if _, err := h.rpc.CallRaw(m.Interface, "setValue", m.Channel, m.Key, false); err != nil {
			return "", "", err
		}
		return home.SetOK, m.Key, nil
	}
	return home.SetNotFound, "", nil
}

// formatValue writes a value as the ReGa lists it
func formatValue(value interface{}) string {
	switch v := value.(type) {
	case nil:
		return ""
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	default:
		return fmt.Sprint(v)
	}
}

// wallClock turns an RFC 3339 time into the ReGa's "2006-01-02 15:04:05"
// in local time, as the app shows it
func wallClock(rfc3339 string) string {
	t, err := time.Parse(time.RFC3339, rfc3339)
	if err != nil {
		return rfc3339
	}
	return t.Local().Format("2006-01-02 15:04:05")
}

// maintenance is what a device's channel 0 reports, with since when
func (h *Home) maintenance(device string) (map[string]interface{}, map[string]int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	values, since := map[string]interface{}{}, map[string]int64{}
	for key, value := range h.values[device+":0"] {
		values[key] = value
		since[key] = h.since[device+":0"][key]
	}
	return values, since
}

// GetDeviceProblems lists the devices with an empty battery or out of
// reach, from the values of their maintenance channels
func (h *Home) GetDeviceProblems() ([]home.DeviceProblem, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	list := []home.DeviceProblem{}
	for _, d := range h.devices() {
		if inboxSkipped(d.iface, d.desc) {
			continue
		}
		values, _ := h.maintenance(d.desc.Address)
		lowBat := values["LOW_BAT"] == true || values["LOWBAT"] == true
		unreach := values["UNREACH"] == true
		if !lowBat && !unreach {
			continue
		}
		roomID, roomName := roomOf(snapshot, d.iface, d.desc.Address)
		list = append(list, home.DeviceProblem{
			Address: d.desc.Address, Name: deviceName(snapshot, d.iface, d.desc.Address),
			RoomID: roomID, RoomName: roomName, LowBat: lowBat, Unreach: unreach,
		})
	}
	return list, nil
}

// GetDeviceHealth lists every device with the values of its maintenance
// channel (LOWBAT as LOW_BAT, as the ReGa's script does)
func (h *Home) GetDeviceHealth() ([]home.DeviceHealth, error) {
	snapshot, err := h.snapshot()
	if err != nil {
		return nil, err
	}
	list := []home.DeviceHealth{}
	for _, d := range h.devices() {
		if inboxSkipped(d.iface, d.desc) {
			continue
		}
		values, since := h.maintenance(d.desc.Address)
		health := map[string]home.HealthValue{}
		for key, value := range values {
			name := key
			if key == "LOWBAT" {
				name = "LOW_BAT"
			}
			health[name] = home.HealthValue{Value: value, Time: since[key]}
		}
		roomID, roomName := roomOf(snapshot, d.iface, d.desc.Address)
		list = append(list, home.DeviceHealth{
			Address: d.desc.Address, Name: deviceName(snapshot, d.iface, d.desc.Address), Type: d.desc.Type,
			Interface: d.iface, RoomID: roomID, RoomName: roomName, Values: health,
		})
	}
	return list, nil
}
