package fakeccu

import (
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
)

// A minimal XML-RPC codec, enough to play the CCU's role in tests.

type xmlNode struct {
	XMLName xml.Name
	Content string    `xml:",chardata"`
	Nodes   []xmlNode `xml:",any"`
}

func (n *xmlNode) child(name string) *xmlNode {
	for i := range n.Nodes {
		if n.Nodes[i].XMLName.Local == name {
			return &n.Nodes[i]
		}
	}
	return nil
}

// decodeCall parses a methodCall into its method name and parameters.
func decodeCall(r io.Reader) (string, []interface{}, error) {
	var call xmlNode
	decoder := xml.NewDecoder(r)
	decoder.CharsetReader = func(_ string, input io.Reader) (io.Reader, error) { return input, nil }
	if err := decoder.Decode(&call); err != nil {
		return "", nil, err
	}
	nameNode := call.child("methodName")
	if call.XMLName.Local != "methodCall" || nameNode == nil {
		return "", nil, fmt.Errorf("not a methodCall")
	}
	var params []interface{}
	if paramsNode := call.child("params"); paramsNode != nil {
		for _, p := range paramsNode.Nodes {
			if v := p.child("value"); v != nil {
				params = append(params, decodeValue(v))
			}
		}
	}
	return strings.TrimSpace(nameNode.Content), params, nil
}

func decodeValue(v *xmlNode) interface{} {
	if len(v.Nodes) == 0 {
		return v.Content // untyped: string
	}
	typed := v.Nodes[0]
	text := strings.TrimSpace(typed.Content)
	switch typed.XMLName.Local {
	case "string":
		return typed.Content
	case "int", "i4", "i8":
		n, _ := strconv.Atoi(text)
		return n
	case "double":
		f, _ := strconv.ParseFloat(text, 64)
		return f
	case "boolean":
		return text == "1"
	case "array":
		list := []interface{}{}
		if data := typed.child("data"); data != nil {
			for i := range data.Nodes {
				list = append(list, decodeValue(&data.Nodes[i]))
			}
		}
		return list
	case "struct":
		m := map[string]interface{}{}
		for _, member := range typed.Nodes {
			name, value := member.child("name"), member.child("value")
			if name != nil && value != nil {
				m[name.Content] = decodeValue(value)
			}
		}
		return m
	}
	return typed.Content
}

func escape(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

func encodeValue(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return "<value></value>"
	case string:
		// Untyped, like the CCU sends most strings
		return "<value>" + escape(x) + "</value>"
	case bool:
		if x {
			return "<value><boolean>1</boolean></value>"
		}
		return "<value><boolean>0</boolean></value>"
	case int:
		return fmt.Sprintf("<value><i4>%d</i4></value>", x)
	case float64:
		if x == math.Trunc(x) && math.Abs(x) < 1<<31 {
			return fmt.Sprintf("<value><i4>%d</i4></value>", int(x))
		}
		return "<value><double>" + strconv.FormatFloat(x, 'f', 6, 64) + "</double></value>"
	case []interface{}:
		var b strings.Builder
		b.WriteString("<value><array><data>")
		for _, item := range x {
			b.WriteString(encodeValue(item))
		}
		b.WriteString("</data></array></value>")
		return b.String()
	case []string:
		list := make([]interface{}, len(x))
		for i, s := range x {
			list[i] = s
		}
		return encodeValue(list)
	case []map[string]interface{}:
		list := make([]interface{}, len(x))
		for i, m := range x {
			list[i] = m
		}
		return encodeValue(list)
	case map[string]interface{}:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var b strings.Builder
		b.WriteString("<value><struct>")
		for _, k := range keys {
			b.WriteString("<member><name>" + escape(k) + "</name>" + encodeValue(x[k]) + "</member>")
		}
		b.WriteString("</struct></value>")
		return b.String()
	}
	return "<value>" + escape(fmt.Sprint(v)) + "</value>"
}

func encodeResponse(v interface{}) string {
	return `<?xml version="1.0"?><methodResponse><params><param>` + encodeValue(v) + `</param></params></methodResponse>`
}

func encodeFault(code int, message string) string {
	return `<?xml version="1.0"?><methodResponse><fault>` +
		encodeValue(map[string]interface{}{"faultCode": code, "faultString": message}) +
		`</fault></methodResponse>`
}

func encodeCall(method string, params ...interface{}) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0"?><methodCall><methodName>` + method + `</methodName><params>`)
	for _, p := range params {
		b.WriteString("<param>" + encodeValue(p) + "</param>")
	}
	b.WriteString("</params></methodCall>")
	return b.String()
}
