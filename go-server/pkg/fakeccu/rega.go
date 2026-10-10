package fakeccu

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"ccu-addon-mui-server/pkg/latin1"
	"ccu-addon-mui-server/pkg/rega"
)

// The fake CCU (fakeccu.go): the ReGa: its scripts and the data they read and change

func (c *CCU) handleRega(w http.ResponseWriter, r *http.Request) {
	if c.Lite {
		http.Error(w, "openccu-lite has no ReGa", http.StatusNotFound)
		return
	}
	// ReGa reads and writes ISO-8859-1 (see package latin1)
	body, _ := io.ReadAll(r.Body)
	// rega.ExecuteComplete: the script's last line writes the end marker
	endLine := "\nWriteLine(\"" + rega.EndMarker + "\");\n"
	script, complete := strings.CutSuffix(latin1.Decode(body), endLine)
	output, err := c.runScript(script)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if complete {
		output += rega.EndMarker + "\r\n"
	}
	// rega.exe appends its variables
	_, _ = w.Write(toLatin1(output + "<xml><exec>/rega.exe</exec></xml>"))
}

// FakeRegaBuild is the ReGaHss version the fake reports
const FakeRegaBuild = "R1.00.0388.0235"

func (c *CCU) runScript(body string) (string, error) {
	if strings.HasPrefix(body, "Write(\"Hello") {
		return "Hello from WebSocket Server", nil
	}
	for _, s := range c.scripts {
		m := s.regex.FindStringSubmatch(body)
		if m == nil {
			continue
		}
		values := map[string]string{}
		for i, field := range s.fields {
			if _, ok := values[field]; !ok {
				values[field] = m[i+1]
			}
		}
		handler, ok := scriptHandlers[s.name]
		if !ok {
			continue
		}
		c.mu.Lock()
		defer c.mu.Unlock()
		return handler(c, s.name, values), nil
	}
	// A script tested in the editor: only Write/WriteLine of strings
	return runTestScript(body)
}

// The statements the fake runs of a tested script
var (
	writeRegex = regexp.MustCompile(`^(Write|WriteLine)\("([^"]*)"\)$`)
)

// checkTestScript stands in for system.SyntaxCheck: every statement must be
// Write("…") or WriteLine("…")
func checkTestScript(code string) string {
	for i, statement := range strings.Split(code, ";") {
		statement = strings.TrimSpace(statement)
		if statement != "" && !writeRegex.MatchString(statement) {
			return fmt.Sprintf("Error 1 at row %d col 1 near ^%s^", i+1, statement)
		}
	}
	return ""
}

func runTestScript(code string) (string, error) {
	if checkTestScript(code) != "" {
		return "", fmt.Errorf("unknown script")
	}
	var b strings.Builder
	for _, statement := range strings.Split(code, ";") {
		if m := writeRegex.FindStringSubmatch(strings.TrimSpace(statement)); m != nil {
			b.WriteString(m[2])
			if m[1] == "WriteLine" {
				b.WriteString("\n")
			}
		}
	}
	return b.String(), nil
}

// users returns the fixture's users, with ids
func (c *CCU) users() []User {
	for i := range c.fixture.Users {
		if c.fixture.Users[i].ID == 0 {
			c.fixture.Users[i].ID = 1001 + int64(i)
		}
	}
	return c.fixture.Users
}

// saveUser creates or changes a user as save_user.tcl
func (c *CCU) saveUser(values map[string]string) string {
	users := c.users()
	id := values["ID"]
	for _, u := range users {
		if u.Name == values["NAME"] && strconv.FormatInt(u.ID, 10) != id {
			return "EXISTS"
		}
	}
	index := -1
	if id == "0" {
		users = append(users, User{ID: c.nextID(), Password: values["PASSWORD"]})
		index = len(users) - 1
	} else {
		for i, u := range users {
			if strconv.FormatInt(u.ID, 10) == id {
				index = i
			}
		}
		if index < 0 {
			return "NOT_FOUND"
		}
		if values["SET_PASSWORD"] == "true" {
			users[index].Password = values["PASSWORD"]
		}
	}
	u := &users[index]
	u.Name, u.FirstName, u.LastName = values["NAME"], values["FIRST_NAME"], values["LAST_NAME"]
	u.Level, _ = strconv.Atoi(values["LEVEL"])
	u.ShowLogin = values["SHOW_LOGIN"] == "true"
	u.Mail, u.Phone = values["MAIL"], values["PHONE"]
	if values["AUTO_LOGIN"] == "true" {
		c.autoLoginUser = u.ID
	} else if c.autoLoginUser == u.ID {
		c.autoLoginUser = 0
	}
	c.fixture.Users = users
	return fmt.Sprintf("OK\t%d", u.ID)
}

// nextID returns an id no ReGa object of the fixture uses yet.
func (c *CCU) nextID() int64 {
	var highest int64 = 100000
	for _, g := range append(append([]Group{}, c.fixture.Rooms...), c.fixture.Trades...) {
		highest = max(highest, g.ID)
	}
	for _, ch := range c.fixture.Channels {
		highest = max(highest, ch.ID)
	}
	for _, sv := range c.fixture.Sysvars {
		highest = max(highest, sv.ID)
	}
	for _, p := range c.fixture.Programs {
		highest = max(highest, p.ID)
	}
	for _, f := range c.fixture.Favorites {
		highest = max(highest, f.ID)
	}
	for _, u := range c.fixture.Users {
		highest = max(highest, u.ID)
	}
	return highest + 1
}

// valueType returns the ReGa value type the add-on parses (see rega/parse.go).
func valueType(v any) string {
	switch v.(type) {
	case bool:
		return "2"
	case float64, int:
		return "4"
	}
	return "20"
}

func formatValue(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	return fmt.Sprint(v)
}

func (c *CCU) getSysvars() string {
	var b strings.Builder
	for _, sv := range c.fixture.Sysvars {
		fmt.Fprintf(&b, "V\t%d\t%t\t%s\n", sv.ID, sv.Visible, sv.Name)
		fmt.Fprintf(&b, "T\t%d\t%d\t%s\n", sv.ValueType, sv.SubType, sv.Unit)
		fmt.Fprintf(&b, "R\t%s\t%s\n", sv.Min, sv.Max)
		fmt.Fprintf(&b, "B\t%s\t%s\n", sv.FalseName, sv.TrueName)
		fmt.Fprintf(&b, "L\t%s\n", sv.ValueList)
		fmt.Fprintf(&b, "X\t%s\n", formatValue(sv.Value))
		fmt.Fprintf(&b, "I\t%s\n", strings.NewReplacer("%", "%25", "\t", "%09", "\r", "%0D", "\n", "%0A").Replace(sv.Description))
		fmt.Fprintf(&b, "C\t%d\n", sv.Channel)
	}
	return b.String()
}

// ProgramRuns returns how often a program was run.
func (c *CCU) ProgramRuns(id int64) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, p := range c.fixture.Programs {
		if p.ID == id {
			return p.Runs
		}
	}
	return 0
}

// parseRegaValue parses a value as the add-on writes it into a script:
// true/false, a number or a quoted string.
func parseRegaValue(s string) any {
	if s == "true" || s == "false" {
		return s == "true"
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return strings.Trim(s, `"`)
}

func (c *CCU) setDatapoint(values map[string]string) string {
	ch := c.channelByAddress(values["INTERFACE"], values["ADDRESS"])
	if ch == nil {
		return "NOT_FOUND"
	}
	if _, ok := ch.Datapoints[values["ATTRIBUTE"]]; !ok {
		return "NOT_FOUND"
	}
	previous := formatValue(ch.Datapoints[values["ATTRIBUTE"]])
	c.setValue(ch, values["ATTRIBUTE"], parseRegaValue(values["VALUE"]))
	return "OK\t" + previous
}

// setValue changes a datapoint and sends the event; c.mu must be held.
func (c *CCU) setValue(ch *Channel, datapoint string, value any) {
	ch.Datapoints[datapoint] = value
	if c.Lite {
		c.publishLite("event", map[string]any{"interface": ch.Interface, "address": ch.Address, "key": datapoint, "value": value})
	}
	for id, url := range c.callbacks[ch.Interface] {
		c.events <- callbackEvent{url: url, interfaceID: id, address: ch.Address, datapoint: datapoint, value: value}
	}
}

// SetValue changes a datapoint as if the device had reported it, e.g. a
// window being opened, and sends the event.
func (c *CCU) SetValue(iface, address, datapoint string, value any) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	ch := c.channelByAddress(iface, address)
	if ch == nil {
		return fmt.Errorf("no channel %s %s", iface, address)
	}
	c.setValue(ch, datapoint, value)
	return nil
}

// Reset restores the fixture as it was loaded; the callbacks stay.
func (c *CCU) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	var fixture Fixture
	_ = json.Unmarshal(c.original, &fixture)
	if fixture.Interfaces == nil {
		fixture.Interfaces = map[string]*InterfaceData{}
	}
	c.fixture = &fixture
	c.metadata = map[string]map[string]any{}
}

// SetSysvar changes a system variable inside the CCU, as a program would
// (no event: system variables send none). Reports whether it exists.
func (c *CCU) SetSysvar(id int64, value any) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := range c.fixture.Sysvars {
		if sv := &c.fixture.Sysvars[i]; sv.ID == id {
			sv.Value = value
			return true
		}
	}
	return false
}

// Metadata returns what setMetadata stored for an object, nil if nothing.
func (c *CCU) Metadata(iface, objectID, dataID string) any {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.metadata[iface][objectID+"/"+dataID]
}

// ChannelMode returns the ReGa metadata "channelMode" of a channel.
func (c *CCU) ChannelMode(iface, address string) *int {
	c.mu.Lock()
	defer c.mu.Unlock()
	if ch := c.channelByAddress(iface, address); ch != nil {
		return ch.Mode
	}
	return nil
}
