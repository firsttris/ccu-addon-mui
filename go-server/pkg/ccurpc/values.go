package ccurpc

import (
	"fmt"
	"math"
	"sort"
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
