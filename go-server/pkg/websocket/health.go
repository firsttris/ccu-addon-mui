package websocket

import (
	"strings"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/rega"
)

// The health of all devices: what their maintenance channels report
// (get_device_health.tcl), and for HmIP devices with a battery the voltage
// at which they report LOW_BAT (MASTER LOW_BAT_LIMIT of channel 0), so the
// app can warn before the battery is empty.

type deviceHealth struct {
	rega.DeviceHealth
	LowBatLimit *float64 `json:"lowBatLimit,omitempty"`
}

type deviceHealthResponse struct {
	Type      string         `json:"type"`
	RequestID string         `json:"requestId,omitempty"`
	Devices   []deviceHealth `json:"devices"`
}

// The limits change only with the device settings: kept for an hour
type lowBatLimitCache struct {
	mu      sync.Mutex
	entries map[string]lowBatLimitEntry
}

type lowBatLimitEntry struct {
	limit   *float64
	fetched time.Time
}

var lowBatLimits = &lowBatLimitCache{entries: map[string]lowBatLimitEntry{}}

const lowBatLimitTTL = time.Hour

func (c *lowBatLimitCache) get(key string) (*float64, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[key]
	if !ok || time.Since(e.fetched) > lowBatLimitTTL {
		return nil, false
	}
	return e.limit, true
}

func (c *lowBatLimitCache) put(key string, limit *float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = lowBatLimitEntry{limit: limit, fetched: time.Now()}
}

func (s *Server) handleDeviceHealth(client *Client, requestID string) {
	devices, err := s.home.GetDeviceHealth()
	if err != nil {
		s.sendRequestError(client, requestID, "getDeviceHealth failed: "+err.Error(), "CCU_ERROR")
		return
	}
	result := make([]deviceHealth, len(devices))
	var wg sync.WaitGroup
	// A few at a time, not to flood the interface processes
	slots := make(chan struct{}, 4)
	for i, device := range devices {
		result[i] = deviceHealth{DeviceHealth: device}
		if _, battery := device.Values["OPERATING_VOLTAGE"]; !battery || s.rpc == nil || !strings.HasPrefix(device.Interface, "HmIP") {
			continue
		}
		key := device.Interface + "." + device.Address
		if limit, ok := lowBatLimits.get(key); ok {
			result[i].LowBatLimit = limit
			continue
		}
		wg.Add(1)
		go func(i int, key string) {
			defer wg.Done()
			slots <- struct{}{}
			defer func() { <-slots }()
			var limit *float64
			if master, err := s.rpc.GetParamset(devices[i].Interface, devices[i].Address+":0", "MASTER"); err == nil {
				if v, ok := master["LOW_BAT_LIMIT"].(float64); ok && v > 0 {
					limit = &v
				}
			}
			lowBatLimits.put(key, limit)
			result[i].LowBatLimit = limit
		}(i, key)
	}
	wg.Wait()
	s.sendJSON(client, deviceHealthResponse{Type: "getDeviceHealth_response", RequestID: requestID, Devices: result})
}
