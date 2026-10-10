package occulite

import (
	"fmt"
	"strconv"

	"ccu-addon-mui-server/pkg/home"
)

// The home model of openccu-lite (home.go): operating

// SetDatapoint sets a value through the interface process, typed as its
// description says (the app sends text, as for the ReGa)
func (h *Home) SetDatapoint(iface, address, attribute, value string) (string, string, error) {
	description, err := h.rpc.GetParamsetDescription(iface, address, "VALUES")
	if err != nil {
		return home.SetNotFound, "", nil
	}
	parameter, ok := description[attribute]
	if !ok {
		return home.SetNotFound, "", nil
	}
	typed, err := typedValue(parameter.Type, value)
	if err != nil {
		return "", "", err
	}
	previous := ""
	if v, ok := h.value(address, attribute); ok {
		previous = fmt.Sprint(v)
	}
	if _, err := h.rpc.CallRaw(iface, "setValue", address, attribute, typed); err != nil {
		return "", "", err
	}
	return home.SetOK, previous, nil
}

func typedValue(kind, value string) (any, error) {
	switch kind {
	case "BOOL", "ACTION":
		return value == "true" || value == "1", nil
	case "FLOAT":
		return strconv.ParseFloat(value, 64)
	case "INTEGER", "ENUM":
		if n, err := strconv.Atoi(value); err == nil {
			return n, nil
		}
		f, err := strconv.ParseFloat(value, 64)
		return int(f), err
	default:
		return value, nil
	}
}
