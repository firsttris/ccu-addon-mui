// Package fakeccu is a stand-in for a CCU in tests: it answers the ReGa
// scripts of the add-on, the XML-RPC interfaces and the WebUI login from a
// Fixture, takes writes in memory and sends events back to the registered
// callbacks, like the real CCU. Go tests and Playwright run against it
// without hardware.
package fakeccu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"ccu-addon-mui-server/pkg/rega"
)

// Interface names and the order their ports are assigned in
var interfaceNames = []string{"BidCos-RF", "HmIP-RF", "VirtualDevices"}

type CCU struct {
	mu      sync.Mutex
	fixture *Fixture
	// original is the fixture as loaded, for Reset
	original []byte

	// callbacks by interface, then by interface id (from init)
	callbacks map[string]map[string]string
	events    chan callbackEvent

	scripts []script

	servers []*http.Server
	// Ports after Start
	RegaPort       int
	WebUIPort      int
	InterfacePorts map[string]int

	// calls counts XML-RPC calls by "interface method"
	calls map[string]int

	// installModeUntil by interface
	installModeUntil map[string]time.Time
	// Time modules created by save_program, for their ids
	timeModules int
}

// CallCount returns how often an XML-RPC method was called, e.g.
// CallCount("HmIP-RF init").
func (c *CCU) CallCount(call string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.calls[call]
}

type callbackEvent struct {
	url, interfaceID, address, datapoint string
	value                                interface{}
}

// script matches a ReGa script built from one of the add-on's templates
// and extracts the values substituted for its placeholders.
type script struct {
	name   string
	regex  *regexp.Regexp
	fields []string
}

var placeholderRegex = regexp.MustCompile(`\\\{\\\{([A-Z_]+)\\\}\\\}`)

func compileScripts() []script {
	var scripts []script
	for name, template := range rega.Scripts() {
		quoted := regexp.QuoteMeta(template)
		var fields []string
		pattern := placeholderRegex.ReplaceAllStringFunc(quoted, func(m string) string {
			fields = append(fields, placeholderRegex.FindStringSubmatch(m)[1])
			return `(.*?)`
		})
		scripts = append(scripts, script{name: name, regex: regexp.MustCompile(`(?s)^` + pattern + `$`), fields: fields})
	}
	return scripts
}

func New(fixture *Fixture) *CCU {
	if fixture.Interfaces == nil {
		fixture.Interfaces = map[string]*InterfaceData{}
	}
	original, _ := json.Marshal(fixture)
	return &CCU{
		fixture:          fixture,
		original:         original,
		callbacks:        map[string]map[string]string{},
		events:           make(chan callbackEvent, 1024),
		scripts:          compileScripts(),
		InterfacePorts:   map[string]int{},
		calls:            map[string]int{},
		installModeUntil: map[string]time.Time{},
	}
}

// Start listens on free ports of host (e.g. "127.0.0.1") unless ports are
// given: rega, webui, then one per interface (BidCos-RF, HmIP-RF,
// VirtualDevices).
func (c *CCU) Start(host string, ports ...int) error {
	port := func(i int) int {
		if i < len(ports) {
			return ports[i]
		}
		return 0
	}
	listen := func(i int, handler http.Handler) (int, error) {
		listener, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, port(i)))
		if err != nil {
			return 0, err
		}
		server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
		c.servers = append(c.servers, server)
		go func() { _ = server.Serve(listener) }()
		return listener.Addr().(*net.TCPAddr).Port, nil
	}

	var err error
	if c.RegaPort, err = listen(0, http.HandlerFunc(c.handleRega)); err != nil {
		return err
	}
	if c.WebUIPort, err = listen(1, http.HandlerFunc(c.handleWebUI)); err != nil {
		return err
	}
	for i, iface := range interfaceNames {
		iface := iface
		p, err := listen(2+i, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { c.handleXMLRPC(iface, w, r) }))
		if err != nil {
			return err
		}
		c.InterfacePorts[iface] = p
	}
	go c.sendEvents()
	return nil
}

func (c *CCU) Close() {
	for _, server := range c.servers {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		_ = server.Shutdown(ctx)
		cancel()
	}
}

// --- ReGa -------------------------------------------------------------

func (c *CCU) handleRega(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	output, err := c.runScript(string(body))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	// rega.exe appends its variables
	_, _ = io.WriteString(w, output+"<xml><exec>/rega.exe</exec></xml>")
}

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
		c.mu.Lock()
		defer c.mu.Unlock()
		switch s.name {
		case "get_rooms":
			return writeGroups(c.fixture.Rooms), nil
		case "get_trades":
			return writeGroups(c.fixture.Trades), nil
		case "get_channels":
			return c.getChannels(values["OBJECT_ID"]), nil
		case "set_datapoint":
			return c.setDatapoint(values), nil
		case "get_device_problems":
			return c.getDeviceProblems(), nil
		case "set_name":
			return c.setName(values["ADDRESS"], values["NAME"]), nil
		case "get_inbox":
			return c.getInbox(), nil
		case "accept_device":
			for i, address := range c.fixture.Inbox {
				if address == values["ADDRESS"] {
					c.fixture.Inbox = append(c.fixture.Inbox[:i], c.fixture.Inbox[i+1:]...)
					return "OK", nil
				}
			}
			return "NOT_FOUND", nil
		case "get_sysvars":
			return c.getSysvars(), nil
		case "set_sysvar":
			id, _ := strconv.ParseInt(values["ID"], 10, 64)
			for i := range c.fixture.Sysvars {
				if sv := &c.fixture.Sysvars[i]; sv.ID == id {
					previous := formatValue(sv.Value)
					sv.Value = parseRegaValue(values["VALUE"])
					// Setting an alarm variable triggers the alarm again
					if sv.SubType == 6 && sv.Value == true {
						sv.AlarmCounter++
						sv.AlarmTime = "2026-01-15 10:00:00"
						sv.receipted = false
					}
					return "OK\t" + previous, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_programs":
			var b strings.Builder
			for _, p := range c.fixture.Programs {
				fmt.Fprintf(&b, "P\t%d\t%t\t%t\t%s\n", p.ID, p.Active, p.Visible, p.Name)
			}
			return b.String(), nil
		case "program_action":
			id, _ := strconv.ParseInt(values["ID"], 10, 64)
			for i := range c.fixture.Programs {
				if p := &c.fixture.Programs[i]; p.ID == id {
					switch values["ACTION"] {
					case "run":
						p.Runs++
					case "on", "off":
						p.Active = values["ACTION"] == "on"
					}
					return "OK", nil
				}
			}
			return "NOT_FOUND", nil
		case "get_device_names":
			return c.getDeviceNames(), nil
		case "set_group_member":
			return c.setGroupMember(values["GROUP_ID"], values["CHANNEL_ID"], values["ACTION"] == "Add"), nil
		case "create_group":
			groups := c.groups(values["LIST_ID"])
			if groups == nil {
				return "NOT_FOUND", nil
			}
			id := c.nextID()
			*groups = append(*groups, Group{ID: id, Name: values["NAME"], Channels: []int64{}})
			return fmt.Sprintf("OK\t%d", id), nil
		case "rename_group", "delete_group":
			groups := c.groups(values["LIST_ID"])
			if groups == nil {
				return "NOT_FOUND", nil
			}
			for i, g := range *groups {
				if strconv.FormatInt(g.ID, 10) == values["ID"] {
					if s.name == "rename_group" {
						(*groups)[i].Name = values["NAME"]
					} else {
						*groups = append((*groups)[:i], (*groups)[i+1:]...)
					}
					return "OK\t" + g.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "create_sysvar":
			id := c.nextID()
			valueType, _ := strconv.Atoi(values["VALUE_TYPE"])
			subType, _ := strconv.Atoi(values["SUB_TYPE"])
			c.fixture.Sysvars = append(c.fixture.Sysvars, Sysvar{
				ID: id, Name: values["NAME"], Visible: true, ValueType: valueType, SubType: subType,
				Unit: values["UNIT"], Min: values["MIN"], Max: values["MAX"],
				FalseName: values["FALSE_NAME"], TrueName: values["TRUE_NAME"], ValueList: values["VALUE_LIST"],
				Value: parseRegaValue(strings.Trim(values["INITIAL"], `"`)),
			})
			return fmt.Sprintf("OK\t%d", id), nil
		case "rename_sysvar", "delete_sysvar":
			for i, sv := range c.fixture.Sysvars {
				if strconv.FormatInt(sv.ID, 10) == values["ID"] {
					if s.name == "rename_sysvar" {
						c.fixture.Sysvars[i].Name = values["NAME"]
					} else {
						c.fixture.Sysvars = append(c.fixture.Sysvars[:i], c.fixture.Sysvars[i+1:]...)
					}
					return "OK\t" + sv.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_service_messages":
			return c.getServiceMessages(), nil
		case "acknowledge_service_message":
			for _, m := range c.serviceMessages() {
				if strconv.FormatInt(m.id, 10) == values["ID"] {
					// Acknowledging ends a sticky message
					if strings.HasPrefix(m.datapoint, "STICKY_") {
						m.channel.Datapoints[m.datapoint] = false
					}
					return "OK\t" + m.datapoint, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_alarm_messages":
			var b strings.Builder
			for _, sv := range c.fixture.Sysvars {
				if sv.SubType != 6 || sv.AlarmCounter == 0 || sv.receipted {
					continue
				}
				message := sv.FalseName
				if sv.Value == true {
					message = sv.TrueName
				}
				fmt.Fprintf(&b, "A\t%d\t%t\t%d\t%s\t%s\t\t\t%s\t%s\n",
					sv.ID, sv.Value == true, sv.AlarmCounter, sv.AlarmTime, sv.AlarmTime, message, sv.Name)
			}
			return b.String(), nil
		case "acknowledge_alarm_message":
			for i := range c.fixture.Sysvars {
				if sv := &c.fixture.Sysvars[i]; strconv.FormatInt(sv.ID, 10) == values["ID"] && sv.SubType == 6 {
					sv.receipted = true
					return "OK\t" + sv.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_favorites":
			return c.getFavorites(values["USERNAME"]), nil
		case "favorite_change":
			return c.changeFavorite(values), nil
		case "set_channel_tile":
			id, _ := strconv.ParseInt(values["ID"], 10, 64)
			if ch := c.channelByID(id); ch != nil {
				ch.Tile = values["TILE"]
				return "OK\t" + ch.Name, nil
			}
			return "NOT_FOUND", nil
		case "get_program":
			return c.getProgram(atoi64(values["ID"])), nil
		case "save_program":
			return c.saveProgram(values["DATA"]), nil
		case "delete_program":
			for i, p := range c.fixture.Programs {
				if strconv.FormatInt(p.ID, 10) == values["ID"] {
					c.fixture.Programs = append(c.fixture.Programs[:i], c.fixture.Programs[i+1:]...)
					return "OK\t" + p.Name, nil
				}
			}
			return "NOT_FOUND", nil
		case "get_user_level":
			for _, user := range c.fixture.Users {
				if user.Name == values["USERNAME"] {
					return strconv.Itoa(user.Level), nil
				}
			}
			return "", nil
		}
	}
	return "", fmt.Errorf("unknown script")
}

// itemType says what a favorite list entry is, as get_favorites.tcl
// writes it, or "" if there is no such object.
func (c *CCU) itemType(id int64) string {
	if c.channelByID(id) != nil {
		return "CHANNEL"
	}
	for _, sv := range c.fixture.Sysvars {
		if sv.ID == id {
			return "SYSVAR"
		}
	}
	for _, p := range c.fixture.Programs {
		if p.ID == id {
			return "PROGRAM"
		}
	}
	return ""
}

func (c *CCU) getFavorites(username string) string {
	var b strings.Builder
	for _, f := range c.fixture.Favorites {
		if username != "" && !slices.Contains(f.Users, username) {
			continue
		}
		fmt.Fprintf(&b, "L\t%d\t%s\n", f.ID, f.Name)
		for _, id := range f.Items {
			if t := c.itemType(id); t != "" {
				fmt.Fprintf(&b, "I\t%d\t%s\n", id, t)
			}
		}
	}
	return b.String()
}

func (c *CCU) changeFavorite(values map[string]string) string {
	if values["ACTION"] == "create" {
		users := []string{}
		for _, u := range c.fixture.Users {
			if values["USERNAME"] == "" || u.Name == values["USERNAME"] {
				users = append(users, u.Name)
			}
		}
		id := c.nextID()
		c.fixture.Favorites = append(c.fixture.Favorites, Favorite{ID: id, Name: values["NAME"], Users: users, Items: []int64{}})
		return fmt.Sprintf("OK\t%d", id)
	}
	listID, _ := strconv.ParseInt(values["LIST_ID"], 10, 64)
	itemID, _ := strconv.ParseInt(values["ITEM_ID"], 10, 64)
	for i := range c.fixture.Favorites {
		f := &c.fixture.Favorites[i]
		if f.ID != listID {
			continue
		}
		previous := f.Name
		switch values["ACTION"] {
		case "rename":
			f.Name = values["NAME"]
		case "delete":
			c.fixture.Favorites = append(c.fixture.Favorites[:i], c.fixture.Favorites[i+1:]...)
		case "add", "remove":
			if c.itemType(itemID) == "" {
				return "NOT_FOUND"
			}
			f.Items = slices.DeleteFunc(f.Items, func(id int64) bool { return id == itemID })
			if values["ACTION"] == "add" {
				f.Items = append(f.Items, itemID)
			}
		}
		return "OK\t" + previous
	}
	return "NOT_FOUND"
}

// groups returns the rooms or trades for a ReGa list constant.
func (c *CCU) groups(listID string) *[]Group {
	switch listID {
	case "ID_ROOMS":
		return &c.fixture.Rooms
	case "ID_FUNCTIONS":
		return &c.fixture.Trades
	}
	return nil
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
	return highest + 1
}

func writeGroups(groups []Group) string {
	var b strings.Builder
	for _, g := range groups {
		fmt.Fprintf(&b, "%d\t%s\n", g.ID, g.Name)
	}
	return b.String()
}

func (c *CCU) channelByID(id int64) *Channel {
	for i := range c.fixture.Channels {
		if c.fixture.Channels[i].ID == id {
			return &c.fixture.Channels[i]
		}
	}
	return nil
}

func (c *CCU) channelByAddress(iface, address string) *Channel {
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if ch.Address == address && (iface == "" || ch.Interface == iface) {
			return ch
		}
	}
	return nil
}

// valueType returns the ReGa value type the add-on parses (see rega/parse.go).
func valueType(v interface{}) string {
	switch v.(type) {
	case bool:
		return "2"
	case float64, int:
		return "4"
	}
	return "20"
}

func formatValue(v interface{}) string {
	switch x := v.(type) {
	case nil:
		return ""
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	return fmt.Sprint(v)
}

func deviceAddress(address string) string {
	device, _, _ := strings.Cut(address, ":")
	return device
}

func (c *CCU) getChannels(objectID string) string {
	var channels []*Channel
	if objectID == "ALL" {
		for i := range c.fixture.Channels {
			if !strings.HasSuffix(c.fixture.Channels[i].Address, ":0") {
				channels = append(channels, &c.fixture.Channels[i])
			}
		}
	} else {
		id, _ := strconv.ParseInt(objectID, 10, 64)
		// Favorite lists hold channels among system variables and programs
		for _, f := range c.fixture.Favorites {
			if f.ID == id {
				for _, itemID := range f.Items {
					if ch := c.channelByID(itemID); ch != nil {
						channels = append(channels, ch)
					}
				}
			}
		}
		for _, g := range append(append([]Group{}, c.fixture.Rooms...), c.fixture.Trades...) {
			if g.ID != id {
				continue
			}
			for _, channelID := range g.Channels {
				if ch := c.channelByID(channelID); ch != nil {
					channels = append(channels, ch)
				}
			}
		}
	}

	var b strings.Builder
	for _, ch := range channels {
		fmt.Fprintf(&b, "C\t%d\t%s\t%s\t%s\t%s\n", ch.ID, ch.Address, ch.Type, ch.Interface, ch.Name)
		fmt.Fprintf(&b, "M\t%s\t%s\n", memberOf(c.fixture.Rooms, ch.ID), memberOf(c.fixture.Trades, ch.ID))
		if ch.Tile != "" {
			fmt.Fprintf(&b, "T\t%s\n", ch.Tile)
		}
		if status := c.channelByAddress(ch.Interface, deviceAddress(ch.Address)+":0"); status != nil {
			for _, dp := range []string{"LOW_BAT", "LOWBAT", "UNREACH"} {
				if v, ok := status.Datapoints[dp]; ok {
					fmt.Fprintf(&b, "S\t%s\t%s\t%s\n", status.Address, dp, formatValue(v))
				}
			}
		}
		for name, v := range ch.Datapoints {
			fmt.Fprintf(&b, "D\t%s\t%s\t%s\n", name, valueType(v), formatValue(v))
		}
	}
	return b.String()
}

// memberOf returns the ids of the groups containing a channel, comma separated.
func memberOf(groups []Group, channelID int64) string {
	var ids []string
	for _, g := range groups {
		for _, id := range g.Channels {
			if id == channelID {
				ids = append(ids, strconv.FormatInt(g.ID, 10))
			}
		}
	}
	return strings.Join(ids, ",")
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

// device returns the description of a device and its interface.
func (c *CCU) device(address string) (map[string]interface{}, string) {
	for iface, data := range c.fixture.Interfaces {
		for _, d := range data.Devices {
			if d["ADDRESS"] == address {
				return d, iface
			}
		}
	}
	return nil, ""
}

func (c *CCU) getInbox() string {
	var b strings.Builder
	for _, address := range c.fixture.Inbox {
		d, iface := c.device(address)
		if d == nil {
			continue
		}
		name := c.fixture.DeviceNames[address]
		if name == "" {
			name = fmt.Sprintf("%v %s", d["TYPE"], address)
		}
		fmt.Fprintf(&b, "%s\t%v\t%s\t%s\n", address, d["TYPE"], iface, name)
	}
	return b.String()
}

// deleteDevice removes a device with its channels everywhere; c.mu must be held.
func (c *CCU) deleteDevice(iface, address string) bool {
	data := c.fixture.Interfaces[iface]
	found := false
	kept := data.Devices[:0]
	for _, d := range data.Devices {
		if d["ADDRESS"] == address || d["PARENT"] == address {
			found = true
			continue
		}
		kept = append(kept, d)
	}
	data.Devices = kept
	if !found {
		return false
	}
	var removed []int64
	channels := c.fixture.Channels[:0]
	for _, ch := range c.fixture.Channels {
		if ch.Interface == iface && deviceAddress(ch.Address) == address {
			removed = append(removed, ch.ID)
			continue
		}
		channels = append(channels, ch)
	}
	c.fixture.Channels = channels
	for _, groups := range []*[]Group{&c.fixture.Rooms, &c.fixture.Trades} {
		for i := range *groups {
			g := &(*groups)[i]
			members := []int64{}
			for _, id := range g.Channels {
				gone := false
				for _, r := range removed {
					gone = gone || id == r
				}
				if !gone {
					members = append(members, id)
				}
			}
			g.Channels = members
		}
	}
	inbox := c.fixture.Inbox[:0]
	for _, a := range c.fixture.Inbox {
		if a != address {
			inbox = append(inbox, a)
		}
	}
	c.fixture.Inbox = inbox
	return true
}

func (c *CCU) getDeviceNames() string {
	var b strings.Builder
	for _, data := range c.fixture.Interfaces {
		for _, d := range data.Devices {
			address, _ := d["ADDRESS"].(string)
			if parent, _ := d["PARENT"].(string); parent != "" || address == "" {
				continue
			}
			name := c.fixture.DeviceNames[address]
			if name == "" {
				name = fmt.Sprintf("%v %s", d["TYPE"], address)
			}
			fmt.Fprintf(&b, "%s\t%s\n", address, name)
		}
	}
	return b.String()
}

func (c *CCU) setName(address, name string) string {
	if !strings.Contains(address, ":") {
		previous := c.fixture.DeviceNames[address]
		if previous == "" && c.channelByAddress("", address+":0") == nil && c.channelByAddress("", address+":1") == nil {
			return "NOT_FOUND"
		}
		if c.fixture.DeviceNames == nil {
			c.fixture.DeviceNames = map[string]string{}
		}
		c.fixture.DeviceNames[address] = name
		return "OK\t" + previous
	}
	ch := c.channelByAddress("", address)
	if ch == nil {
		return "NOT_FOUND"
	}
	previous := ch.Name
	ch.Name = name
	return "OK\t" + previous
}

func (c *CCU) setGroupMember(groupID, channelID string, member bool) string {
	gid, _ := strconv.ParseInt(groupID, 10, 64)
	cid, _ := strconv.ParseInt(channelID, 10, 64)
	if c.channelByID(cid) == nil {
		return "NOT_FOUND"
	}
	for _, groups := range []*[]Group{&c.fixture.Rooms, &c.fixture.Trades} {
		for i := range *groups {
			g := &(*groups)[i]
			if g.ID != gid {
				continue
			}
			kept := []int64{}
			for _, id := range g.Channels {
				if id != cid {
					kept = append(kept, id)
				}
			}
			if member {
				kept = append(kept, cid)
			}
			g.Channels = kept
			return "OK"
		}
	}
	return "NOT_FOUND"
}

// parseRegaValue parses a value as the add-on writes it into a script:
// true/false, a number or a quoted string.
func parseRegaValue(s string) interface{} {
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
	if status := c.channelByAddress(ch.Interface, values["DEVICE_ADDRESS"]+":0"); status != nil && status.Datapoints["UNREACH"] == true {
		return "UNREACH"
	}
	previous := formatValue(ch.Datapoints[values["ATTRIBUTE"]])
	c.setValue(ch, values["ATTRIBUTE"], parseRegaValue(values["VALUE"]))
	return "OK\t" + previous
}

// setValue changes a datapoint and sends the event; c.mu must be held.
func (c *CCU) setValue(ch *Channel, datapoint string, value interface{}) {
	ch.Datapoints[datapoint] = value
	for id, url := range c.callbacks[ch.Interface] {
		c.events <- callbackEvent{url: url, interfaceID: id, address: ch.Address, datapoint: datapoint, value: value}
	}
}

// SetValue changes a datapoint as if the device had reported it, e.g. a
// window being opened, and sends the event.
func (c *CCU) SetValue(iface, address, datapoint string, value interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	ch := c.channelByAddress(iface, address)
	if ch == nil {
		return fmt.Errorf("no channel %s %s", iface, address)
	}
	c.setValue(ch, datapoint, value)
	return nil
}

func (c *CCU) getDeviceProblems() string {
	var b strings.Builder
	for _, ch := range c.fixture.Channels {
		if !strings.HasSuffix(ch.Address, ":0") || ch.Interface == "VirtualDevices" {
			continue
		}
		lowBat := ch.Datapoints["LOW_BAT"] == true || ch.Datapoints["LOWBAT"] == true
		unreach := ch.Datapoints["UNREACH"] == true
		if !lowBat && !unreach {
			continue
		}
		device := deviceAddress(ch.Address)
		roomID, roomName := "", ""
		if first := c.channelByAddress(ch.Interface, device+":1"); first != nil {
			for _, room := range c.fixture.Rooms {
				for _, id := range room.Channels {
					if id == first.ID && roomID == "" {
						roomID, roomName = strconv.FormatInt(room.ID, 10), room.Name
					}
				}
			}
		}
		name := c.fixture.DeviceNames[device]
		if name == "" {
			name = device
		}
		fmt.Fprintf(&b, "P\t%s\t%t\t%t\t%s\t%s\t%s\n", device, lowBat, unreach, roomID, roomName, name)
	}
	return b.String()
}

// serviceDatapoints raise a service message while true (or, for the error
// codes, not 0), in the order ReGa would number their alarms.
var serviceDatapoints = []string{
	"UNREACH", "STICKY_UNREACH", "LOW_BAT", "LOWBAT", "CONFIG_PENDING", "UPDATE_PENDING",
	"SABOTAGE", "STICKY_SABOTAGE", "ERROR_CODE", "DUTY_CYCLE", "DEVICE_IN_BOOTLOADER",
}

type serviceMessage struct {
	id        int64
	channel   *Channel
	datapoint string
}

func (c *CCU) serviceMessages() []serviceMessage {
	var messages []serviceMessage
	for i := range c.fixture.Channels {
		ch := &c.fixture.Channels[i]
		if !strings.HasSuffix(ch.Address, ":0") || ch.Interface == "VirtualDevices" {
			continue
		}
		for j, datapoint := range serviceDatapoints {
			value, ok := ch.Datapoints[datapoint]
			if !ok || value == false || value == nil || value == 0.0 || value == 0 {
				continue
			}
			messages = append(messages, serviceMessage{id: ch.ID*100 + int64(j), channel: ch, datapoint: datapoint})
		}
	}
	return messages
}

func (c *CCU) getServiceMessages() string {
	var b strings.Builder
	for _, m := range c.serviceMessages() {
		device := deviceAddress(m.channel.Address)
		roomID, roomName := "", ""
		if first := c.channelByAddress(m.channel.Interface, device+":1"); first != nil {
			for _, room := range c.fixture.Rooms {
				for _, id := range room.Channels {
					if id == first.ID && roomID == "" {
						roomID, roomName = strconv.FormatInt(room.ID, 10), room.Name
					}
				}
			}
		}
		name := c.fixture.DeviceNames[device]
		if name == "" {
			name = device
		}
		fmt.Fprintf(&b, "S\t%d\t%s\t%s\t2026-01-15 09:00:00\t%s\t%s\t%s\t%s\n",
			m.id, m.datapoint, formatValue(m.channel.Datapoints[m.datapoint]), device, roomID, roomName, name)
	}
	return b.String()
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
}

// --- WebUI login and test control -----------------------------------------

// handleControl lets tests outside Go drive the fake CCU:
//
//	POST /fake/set   {"interface", "address", "datapoint", "value"}  a device reports a value
//	POST /fake/reset                                                  back to the fixture
func (c *CCU) handleControl(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	switch r.URL.Path {
	case "/fake/reset":
		c.Reset()
	case "/fake/set":
		var req struct {
			Interface string      `json:"interface"`
			Address   string      `json:"address"`
			Datapoint string      `json:"datapoint"`
			Value     interface{} `json:"value"`
		}
		if err := jsonDecode(r.Body, &req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := c.SetValue(req.Interface, req.Address, req.Datapoint, req.Value); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
	default:
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (c *CCU) handleWebUI(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/fake/") {
		c.handleControl(w, r)
		return
	}
	if r.URL.Path == "/config/cp_security.cgi" {
		c.handleBackup(w, r)
		return
	}
	var req struct {
		Method string            `json:"method"`
		Params map[string]string `json:"params"`
	}
	if err := jsonDecode(r.Body, &req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	switch req.Method {
	case "Session.login":
		c.mu.Lock()
		defer c.mu.Unlock()
		for _, user := range c.fixture.Users {
			if user.Name == req.Params["username"] && user.Password == req.Params["password"] {
				_, _ = io.WriteString(w, `{"version":"1.1","result":"fakeSession1","error":null}`)
				return
			}
		}
		_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"name":"JSONRPCError","code":501,"message":"invalid credentials"}}`)
	case "Session.logout":
		_, _ = io.WriteString(w, `{"version":"1.1","result":true,"error":null}`)
	default:
		_, _ = io.WriteString(w, `{"version":"1.1","result":null,"error":{"code":404,"message":"unknown method"}}`)
	}
}

// FakeBackup is the content of every backup the fake CCU creates
const FakeBackup = "fake CCU backup (usr_local.tar.gz, signature, key_index, firmware_version)"

// handleBackup is the WebUI's "create backup" button: with a valid session
// it sends a .sbk file, otherwise the login page.
func (c *CCU) handleBackup(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	c.calls["WebUI create_backup"]++
	c.mu.Unlock()
	// Like the WebUI, which looks for the session in the raw query
	if !strings.Contains(r.URL.RawQuery, "sid=@fakeSession1@") || r.URL.Query().Get("action") != "create_backup" {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, "<html><body>Session expired</body></html>")
		return
	}
	// Headers as in the WebUI's backup.tcl
	w.Header().Set("Content-Type", "application/x-download")
	w.Header().Set("Content-Disposition", "attachment;filename=ccu3-webui-2026-10-03.sbk")
	_, _ = io.WriteString(w, FakeBackup)
}

// --- XML-RPC --------------------------------------------------------------

func (c *CCU) handleXMLRPC(iface string, w http.ResponseWriter, r *http.Request) {
	method, params, err := decodeCall(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	result, fault := c.call(iface, method, params)
	w.Header().Set("Content-Type", "text/xml")
	if fault != "" {
		_, _ = io.WriteString(w, encodeFault(-1, fault))
		return
	}
	_, _ = io.WriteString(w, encodeResponse(result))
}

func stringParam(params []interface{}, i int) string {
	if i < len(params) {
		s, _ := params[i].(string)
		return s
	}
	return ""
}

func (c *CCU) call(iface, method string, params []interface{}) (interface{}, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.calls[iface+" "+method]++
	data := c.fixture.Interfaces[iface]
	if data == nil {
		data = &InterfaceData{}
		c.fixture.Interfaces[iface] = data
	}

	switch method {
	case "system.listMethods":
		return []string{"init", "ping", "listDevices", "getDeviceDescription", "getParamsetDescription", "getParamset",
			"putParamset", "setValue", "setInstallMode", "getInstallMode", "deleteDevice", "getLinks", "addLink", "removeLink"}, ""
	case "setInstallMode":
		on, _ := params[0].(bool)
		seconds := 60
		if len(params) > 1 {
			if n, ok := params[1].(int); ok {
				seconds = n
			}
		}
		if on {
			c.installModeUntil[iface] = time.Now().Add(time.Duration(seconds) * time.Second)
		} else {
			delete(c.installModeUntil, iface)
		}
		return "", ""
	case "getInstallMode":
		remaining := time.Until(c.installModeUntil[iface])
		if remaining < 0 {
			remaining = 0
		}
		return int(remaining.Seconds()), ""
	case "installFirmware":
		address := stringParam(params, 0)
		for _, d := range data.Devices {
			if d["ADDRESS"] != address {
				continue
			}
			state, _ := d["FIRMWARE_UPDATE_STATE"].(string)
			if !strings.HasSuffix(state, "READY_FOR_UPDATE") {
				return nil, "Firmware update not ready"
			}
			d["FIRMWARE"] = d["AVAILABLE_FIRMWARE"]
			d["FIRMWARE_UPDATE_STATE"] = strings.TrimSuffix(state, "READY_FOR_UPDATE") + "UP_TO_DATE"
			return true, ""
		}
		return nil, "Unknown instance"
	case "deleteDevice":
		if !c.deleteDevice(iface, stringParam(params, 0)) {
			return nil, "Unknown instance"
		}
		return "", ""
	case "init":
		url, id := stringParam(params, 0), stringParam(params, 1)
		if c.callbacks[iface] == nil {
			c.callbacks[iface] = map[string]string{}
		}
		if id == "" {
			for existing, u := range c.callbacks[iface] {
				if u == url {
					delete(c.callbacks[iface], existing)
				}
			}
		} else {
			c.callbacks[iface][id] = url
		}
		return "", ""
	case "ping":
		id := stringParam(params, 0)
		if url, ok := c.callbacks[iface][id]; ok {
			c.events <- callbackEvent{url: url, interfaceID: id, address: "CENTRAL", datapoint: "PONG", value: id}
		}
		return true, ""
	case "listDevices":
		return data.Devices, ""
	case "getDeviceDescription":
		for _, d := range data.Devices {
			if d["ADDRESS"] == stringParam(params, 0) {
				return d, ""
			}
		}
		return nil, "Unknown instance"
	case "getParamsetDescription":
		address, key := stringParam(params, 0), stringParam(params, 1)
		description, ok := data.ParamsetDescriptions[address][key]
		if !ok && strings.Contains(key, ":") {
			// Link parameters: the same for every partner
			description, ok = data.ParamsetDescriptions[address]["LINK"]
		}
		if !ok {
			return nil, "Unknown paramset"
		}
		if description == nil {
			// Older exports wrote empty paramsets as null
			description = map[string]interface{}{}
		}
		return description, ""
	case "getParamset":
		address, key := stringParam(params, 0), stringParam(params, 1)
		if key == "VALUES" {
			if ch := c.channelByAddress(iface, address); ch != nil {
				return ch.Datapoints, ""
			}
		}
		if values, ok := data.Paramsets[address][key]; ok {
			return values, ""
		}
		if description, ok := data.ParamsetDescriptions[address]["LINK"]; ok && strings.Contains(key, ":") {
			defaults := map[string]interface{}{}
			for name, raw := range description {
				if p, ok := raw.(map[string]interface{}); ok {
					defaults[name] = p["DEFAULT"]
				}
			}
			return defaults, ""
		}
		return nil, "Unknown paramset"
	case "listBidcosInterfaces":
		if data.RadioInterfaces == nil {
			return nil, "Unknown method listBidcosInterfaces"
		}
		return data.RadioInterfaces, ""
	case "getLinks":
		address := stringParam(params, 0)
		links := []interface{}{}
		for _, link := range data.Links {
			for _, end := range []interface{}{link["SENDER"], link["RECEIVER"]} {
				// An empty address asks for all links
				if address == "" || end == address || deviceAddress(fmt.Sprint(end)) == address {
					links = append(links, link)
					break
				}
			}
		}
		return links, ""
	case "addLink":
		data.Links = append(data.Links, map[string]interface{}{
			"SENDER": stringParam(params, 0), "RECEIVER": stringParam(params, 1),
			"NAME": stringParam(params, 2), "DESCRIPTION": stringParam(params, 3), "FLAGS": 0,
		})
		return "", ""
	case "removeLink":
		kept := data.Links[:0]
		removed := false
		for _, link := range data.Links {
			if link["SENDER"] == stringParam(params, 0) && link["RECEIVER"] == stringParam(params, 1) {
				removed = true
				continue
			}
			kept = append(kept, link)
		}
		data.Links = kept
		if !removed {
			return nil, "Unknown link"
		}
		return "", ""
	case "setValue":
		ch := c.channelByAddress(iface, stringParam(params, 0))
		if ch == nil || len(params) < 3 {
			return nil, "Unknown instance"
		}
		c.setValue(ch, stringParam(params, 1), params[2])
		return "", ""
	case "putParamset":
		address, key := stringParam(params, 0), stringParam(params, 1)
		values, _ := params[len(params)-1].(map[string]interface{})
		if key == "VALUES" {
			ch := c.channelByAddress(iface, address)
			if ch == nil {
				return nil, "Unknown instance"
			}
			for name, v := range values {
				c.setValue(ch, name, v)
			}
			return "", ""
		}
		if data.Paramsets == nil {
			data.Paramsets = map[string]map[string]map[string]interface{}{}
		}
		if data.Paramsets[address] == nil {
			data.Paramsets[address] = map[string]map[string]interface{}{}
		}
		if data.Paramsets[address][key] == nil {
			data.Paramsets[address][key] = map[string]interface{}{}
		}
		for name, v := range values {
			data.Paramsets[address][key][name] = v
		}
		return "", ""
	}
	return nil, "Unknown method " + method
}

// sendEvents delivers events to the callbacks one at a time, in order, as
// system.multicall like the CCU.
func (c *CCU) sendEvents() {
	client := &http.Client{Timeout: 5 * time.Second}
	for e := range c.events {
		call := encodeCall("system.multicall", []interface{}{
			map[string]interface{}{
				"methodName": "event",
				"params":     []interface{}{e.interfaceID, e.address, e.datapoint, e.value},
			},
		})
		resp, err := client.Post(e.url, "text/xml", bytes.NewBufferString(call))
		if err == nil {
			resp.Body.Close()
		}
	}
}
