package ccurpc

import (
	"strconv"
	"strings"
)

// DeviceDescription describes a device or one of its channels, see the
// HomeMatic XML-RPC documentation (DeviceDescription).
type DeviceDescription struct {
	Type       string   `json:"type"`
	Address    string   `json:"address"`
	Parent     string   `json:"parent,omitempty"`
	ParentType string   `json:"parentType,omitempty"`
	Children   []string `json:"children,omitempty"`
	Paramsets  []string `json:"paramsets"`
	Index      int      `json:"index"`
	Version    int      `json:"version"`
	Firmware   string   `json:"firmware,omitempty"`
	// Firmware the CCU has for the device, if newer is known ("0.0.0"
	// means none)
	AvailableFirmware string `json:"availableFirmware,omitempty"`
	// HmIP: UP_TO_DATE, NEW_FIRMWARE_AVAILABLE, DELIVER_FIRMWARE_IMAGE,
	// READY_FOR_UPDATE, DO_UPDATE_PENDING, PERFORMING_UPDATE (LIVE_* for
	// mains powered devices)
	FirmwareUpdateState string `json:"firmwareUpdateState,omitempty"`
	// The device can get a firmware update (UPDATABLE)
	Updatable  bool     `json:"updatable,omitempty"`
	Flags      int      `json:"flags"`
	Direction  int      `json:"direction,omitempty"`
	LinkSource []string `json:"linkSourceRoles,omitempty"`
	LinkTarget []string `json:"linkTargetRoles,omitempty"`
	// BidCos-RF: the radio module (gateway serial) the device is assigned
	// to, and whether it may change to another (roaming)
	Interface string `json:"interface,omitempty"`
	Roaming   bool   `json:"roaming,omitempty"`
}

// Parameter operations (bit mask)
const (
	OperationRead  = 1
	OperationWrite = 2
	OperationEvent = 4
)

// Parameter flags (bit mask)
const (
	FlagVisible   = 0x01
	FlagInternal  = 0x02
	FlagTransform = 0x04
	FlagService   = 0x08
	FlagSticky    = 0x10
)

// SpecialValue is a value with its own meaning outside min/max, such as
// "not used" or "unlimited".
type SpecialValue struct {
	ID    string      `json:"id"`
	Value interface{} `json:"value"`
}

// ParameterDescription describes one parameter of a paramset, see the
// HomeMatic XML-RPC documentation (ParameterDescription).
type ParameterDescription struct {
	// Type is FLOAT, INTEGER, BOOL, ENUM, STRING or ACTION
	Type       string         `json:"type"`
	Operations int            `json:"operations"`
	Flags      int            `json:"flags"`
	Default    interface{}    `json:"default,omitempty"`
	Min        interface{}    `json:"min,omitempty"`
	Max        interface{}    `json:"max,omitempty"`
	Unit       string         `json:"unit,omitempty"`
	TabOrder   int            `json:"tabOrder"`
	Control    string         `json:"control,omitempty"`
	ValueList  []string       `json:"valueList,omitempty"`
	Special    []SpecialValue `json:"special,omitempty"`
}

// ParamsetDescription maps parameter names to their descriptions.
type ParamsetDescription map[string]ParameterDescription

func asString(v interface{}) string {
	s, _ := v.(string)
	return s
}

func asInt(v interface{}) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case float64:
		return int(x)
	case bool:
		if x {
			return 1
		}
	}
	return 0
}

func asStrings(v interface{}) []string {
	list, _ := v.([]interface{})
	result := make([]string, 0, len(list))
	for _, item := range list {
		if s, ok := item.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

// roles splits LINK_SOURCE_ROLES/LINK_TARGET_ROLES, a space separated string.
func roles(v interface{}) []string {
	return strings.Fields(asString(v))
}

func parseDeviceDescription(m map[string]interface{}) DeviceDescription {
	return DeviceDescription{
		Type:                asString(m["TYPE"]),
		Address:             asString(m["ADDRESS"]),
		Parent:              asString(m["PARENT"]),
		ParentType:          asString(m["PARENT_TYPE"]),
		Children:            asStrings(m["CHILDREN"]),
		Paramsets:           asStrings(m["PARAMSETS"]),
		Index:               asInt(m["INDEX"]),
		Version:             asInt(m["VERSION"]),
		Firmware:            asString(m["FIRMWARE"]),
		AvailableFirmware:   availableFirmware(m),
		FirmwareUpdateState: asString(m["FIRMWARE_UPDATE_STATE"]),
		Updatable:           asInt(m["UPDATABLE"]) != 0,
		Flags:               asInt(m["FLAGS"]),
		Direction:           asInt(m["DIRECTION"]),
		LinkSource:          roles(m["LINK_SOURCE_ROLES"]),
		LinkTarget:          roles(m["LINK_TARGET_ROLES"]),
		Interface:           asString(m["INTERFACE"]),
		Roaming:             asInt(m["ROAMING"]) != 0,
	}
}

// availableFirmware is the newer firmware the CCU knows for a device, or ""
func availableFirmware(m map[string]interface{}) string {
	available := asString(m["AVAILABLE_FIRMWARE"])
	if available == "0.0.0" || available == asString(m["FIRMWARE"]) {
		return ""
	}
	return available
}

// number makes MIN, MAX, DEFAULT and the special values of a FLOAT or
// INTEGER parameter numbers when they came as text: hmipserver sends those
// of its virtual devices untyped (<value>4.5</value>, read as a string),
// seen on openccu-lite's heating groups, and the app only uses numbers
func number(kind string, v interface{}) interface{} {
	s, ok := v.(string)
	if !ok || (kind != "FLOAT" && kind != "INTEGER") {
		return v
	}
	f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return v
	}
	if kind == "INTEGER" {
		return int(f)
	}
	return f
}

func parseParamsetDescription(m map[string]interface{}) ParamsetDescription {
	description := ParamsetDescription{}
	for name, raw := range m {
		p, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		kind := asString(p["TYPE"])
		parameter := ParameterDescription{
			Type:       kind,
			Operations: asInt(p["OPERATIONS"]),
			Flags:      asInt(p["FLAGS"]),
			Default:    number(kind, p["DEFAULT"]),
			Min:        number(kind, p["MIN"]),
			Max:        number(kind, p["MAX"]),
			Unit:       asString(p["UNIT"]),
			TabOrder:   asInt(p["TAB_ORDER"]),
			Control:    asString(p["CONTROL"]),
			ValueList:  asStrings(p["VALUE_LIST"]),
		}
		if specials, ok := p["SPECIAL"].([]interface{}); ok {
			for _, s := range specials {
				if sm, ok := s.(map[string]interface{}); ok {
					parameter.Special = append(parameter.Special, SpecialValue{ID: asString(sm["ID"]), Value: number(kind, sm["VALUE"])})
				}
			}
		}
		description[name] = parameter
	}
	return description
}
