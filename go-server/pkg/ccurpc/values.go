package ccurpc

import (
	"fmt"
	"math"
	"sort"
	"strings"
)

// CoerceValues checks values for putParamset against the paramset
// description and converts them to the types XML-RPC needs: JSON only has
// float64, but the CCU rejects a double for an INTEGER or ENUM parameter.
// Unknown, read-only and out-of-range values are an error, so a broken or
// malicious client can't send the CCU anything the WebUI wouldn't.
func CoerceValues(description ParamsetDescription, values map[string]interface{}) (map[string]interface{}, error) {
	if len(values) == 0 {
		return nil, fmt.Errorf("no values")
	}
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)

	result := make(map[string]interface{}, len(values))
	for _, name := range names {
		parameter, ok := description[name]
		if !ok {
			return nil, fmt.Errorf("%s: unknown parameter", name)
		}
		if parameter.Operations&OperationWrite == 0 {
			return nil, fmt.Errorf("%s: not writable", name)
		}
		value, err := coerce(parameter, values[name])
		if err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		result[name] = value
	}
	return result, nil
}

func isSpecial(parameter ParameterDescription, value float64) bool {
	for _, special := range parameter.Special {
		if f, ok := toFloat(special.Value); ok && f == value {
			return true
		}
	}
	return false
}

func toFloat(v interface{}) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	}
	return 0, false
}

func checkRange(parameter ParameterDescription, value float64) error {
	if isSpecial(parameter, value) {
		return nil
	}
	if min, ok := toFloat(parameter.Min); ok && value < min {
		return fmt.Errorf("%v is below the minimum %v", value, min)
	}
	if max, ok := toFloat(parameter.Max); ok && value > max {
		return fmt.Errorf("%v is above the maximum %v", value, max)
	}
	return nil
}

func coerce(parameter ParameterDescription, value interface{}) (interface{}, error) {
	switch parameter.Type {
	case "BOOL", "ACTION":
		b, ok := value.(bool)
		if !ok {
			return nil, fmt.Errorf("expected a boolean")
		}
		return b, nil
	case "STRING":
		s, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("expected a string")
		}
		return s, nil
	case "FLOAT":
		f, ok := toFloat(value)
		if !ok || math.IsNaN(f) || math.IsInf(f, 0) {
			return nil, fmt.Errorf("expected a number")
		}
		if err := checkRange(parameter, f); err != nil {
			return nil, err
		}
		return f, nil
	case "INTEGER", "ENUM":
		f, ok := toFloat(value)
		if !ok || f != math.Trunc(f) || math.Abs(f) > math.MaxInt32 {
			return nil, fmt.Errorf("expected a whole number")
		}
		if parameter.Type == "ENUM" && len(parameter.ValueList) > 0 && !isSpecial(parameter, f) &&
			(f < 0 || int(f) >= len(parameter.ValueList)) {
			return nil, fmt.Errorf("%v is not in the value list", f)
		}
		if err := checkRange(parameter, f); err != nil {
			return nil, err
		}
		return int(f), nil
	}
	return nil, fmt.Errorf("unsupported type %s", parameter.Type)
}

// PutParamset writes values (checked with CoerceValues) to a paramset.
func (c *Client) PutParamset(iface, address, paramsetKey string, values map[string]interface{}) error {
	if err := validate(address, paramsetKey); err != nil {
		return err
	}
	var reply interface{}
	return c.call(iface, "putParamset", []interface{}{address, paramsetKey, values}, &reply)
}

// SetInstallMode starts (or stops) pairing on an interface for seconds.
func (c *Client) SetInstallMode(iface string, on bool, seconds int) error {
	if seconds < 0 || seconds > 300 {
		return fmt.Errorf("invalid duration")
	}
	var reply interface{}
	return c.call(iface, "setInstallMode", []interface{}{on, seconds, 1}, &reply)
}

// GetInstallMode returns the seconds pairing is still on (0: off).
func (c *Client) GetInstallMode(iface string) (int, error) {
	var reply interface{}
	if err := c.call(iface, "getInstallMode", nil, &reply); err != nil {
		return 0, err
	}
	return asInt(reply), nil
}

// Flags of deleteDevice
const (
	DeleteReset = 0x01 // reset the device to factory settings
	DeleteForce = 0x02 // delete even if the device can't be reached
)

// DeleteDevice removes a device from the CCU.
func (c *Client) DeleteDevice(iface, address string, flags int) error {
	if !addressRegex.MatchString(address) || strings.Contains(address, ":") {
		return ErrInvalidAddress
	}
	var reply interface{}
	return c.call(iface, "deleteDevice", []interface{}{address, flags}, &reply)
}

// RadioInterface is a radio module of the CCU (built-in or LAN gateway).
type RadioInterface struct {
	Address     string `json:"address"`
	Description string `json:"description,omitempty"`
	Connected   bool   `json:"connected"`
	Default     bool   `json:"default"`
	// DutyCycle is the share of the allowed transmit time used in the last
	// hour, in percent; at 100 % the module stops sending.
	DutyCycle int `json:"dutyCycle"`
}

// ListBidcosInterfaces returns the radio modules of an interface.
func (c *Client) ListBidcosInterfaces(iface string) ([]RadioInterface, error) {
	var reply []interface{}
	if err := c.call(iface, "listBidcosInterfaces", nil, &reply); err != nil {
		return nil, err
	}
	modules := []RadioInterface{}
	for _, raw := range reply {
		m, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		connected, _ := m["CONNECTED"].(bool)
		isDefault, _ := m["DEFAULT"].(bool)
		modules = append(modules, RadioInterface{
			Address:     asString(m["ADDRESS"]),
			Description: asString(m["DESCRIPTION"]),
			Connected:   connected,
			Default:     isDefault,
			DutyCycle:   asInt(m["DUTY_CYCLE"]),
		})
	}
	return modules, nil
}

// ListReplaceableDevices returns the devices a new device can replace
// (devices only, no channels), as the WebUI's ic_seldevice.cgi asks the
// interface with listReplaceableDevices. HmIP can't replace devices.
func (c *Client) ListReplaceableDevices(iface, newAddress string) ([]DeviceDescription, error) {
	if !addressRegex.MatchString(newAddress) || strings.Contains(newAddress, ":") {
		return nil, ErrInvalidAddress
	}
	var reply []interface{}
	if err := c.call(iface, "listReplaceableDevices", []interface{}{newAddress}, &reply); err != nil {
		return nil, err
	}
	devices := []DeviceDescription{}
	for _, raw := range reply {
		if m, ok := raw.(map[string]interface{}); ok {
			if d := parseDeviceDescription(m); d.Parent == "" {
				devices = append(devices, d)
			}
		}
	}
	return devices, nil
}

// ReplaceDevice moves the configuration, links and programs of the old
// device to the new one (Interface.changeDevice: replaceDevice).
func (c *Client) ReplaceDevice(iface, oldAddress, newAddress string) error {
	for _, a := range []string{oldAddress, newAddress} {
		if !addressRegex.MatchString(a) || strings.Contains(a, ":") {
			return ErrInvalidAddress
		}
	}
	var reply interface{}
	return c.call(iface, "replaceDevice", []interface{}{oldAddress, newAddress}, &reply)
}
