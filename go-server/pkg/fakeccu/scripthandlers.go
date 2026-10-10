package fakeccu

import (
	"cmp"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"
)

// What the fake answers to the ReGa scripts it recognizes (scripts.go), by
// the script's name; name tells the scripts apart that share an answer
// (renameOrDeleteGroup, renameOrDeleteSysvar, comTest)
type scriptHandler func(c *CCU, name string, values map[string]string) string

var scriptHandlers = map[string]scriptHandler{
	"get_rooms": func(c *CCU, name string, values map[string]string) string {
		return writeGroups(c.fixture.Rooms)
	},
	"get_trades": func(c *CCU, name string, values map[string]string) string {
		return writeGroups(c.fixture.Trades)
	},
	"get_channels": func(c *CCU, name string, values map[string]string) string {
		return c.getChannels(values["OBJECT_ID"])
	},
	"set_datapoint": func(c *CCU, name string, values map[string]string) string {
		return c.setDatapoint(values)
	},
	"get_device_health": func(c *CCU, name string, values map[string]string) string {
		return c.getDeviceHealth()
	},
	"get_device_problems": func(c *CCU, name string, values map[string]string) string {
		return c.getDeviceProblems()
	},
	"set_name": func(c *CCU, name string, values map[string]string) string {
		return c.setName(values["ADDRESS"], values["NAME"])
	},
	"get_inbox": func(c *CCU, name string, values map[string]string) string {
		return c.getInbox()
	},
	"setup_group_device": func(c *CCU, name string, values map[string]string) string {
		return c.setupGroupDevice(values)
	},
	"accept_device": func(c *CCU, name string, values map[string]string) string {
		for i, address := range c.fixture.Inbox {
			if address == values["ADDRESS"] {
				c.fixture.Inbox = append(c.fixture.Inbox[:i], c.fixture.Inbox[i+1:]...)
				return "OK"
			}
		}
		return "NOT_FOUND"
	},
	"get_sysvars": func(c *CCU, name string, values map[string]string) string {
		return c.getSysvars()
	},
	"set_sysvar": func(c *CCU, name string, values map[string]string) string {
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
				return "OK\t" + previous
			}
		}
		return "NOT_FOUND"
	},
	"get_programs": func(c *CCU, name string, values map[string]string) string {
		var b strings.Builder
		for _, p := range c.fixture.Programs {
			fmt.Fprintf(&b, "P\t%d\t%t\t%t\t%t\t%t\t%s\n", p.ID, p.Active, p.Visible, !p.ReadOnly, p.Internal, p.Name)
		}
		return b.String()
	},
	"program_action": func(c *CCU, name string, values map[string]string) string {
		id, _ := strconv.ParseInt(values["ID"], 10, 64)
		for i := range c.fixture.Programs {
			if p := &c.fixture.Programs[i]; p.ID == id {
				switch values["ACTION"] {
				case "run":
					p.Runs++
				case "on", "off":
					p.Active = values["ACTION"] == "on"
				}
				return "OK"
			}
		}
		return "NOT_FOUND"
	},
	"get_device_names": func(c *CCU, name string, values map[string]string) string {
		return c.getDeviceNames()
	},
	"set_group_member": func(c *CCU, name string, values map[string]string) string {
		return c.setGroupMember(values["GROUP_ID"], values["CHANNEL_ID"], values["ACTION"] == "Add")
	},
	"create_group": func(c *CCU, name string, values map[string]string) string {
		groups := c.groups(values["LIST_ID"])
		if groups == nil {
			return "NOT_FOUND"
		}
		id := c.nextID()
		*groups = append(*groups, Group{ID: id, Name: values["NAME"], Channels: []int64{}})
		return fmt.Sprintf("OK\t%d", id)
	},
	"rename_group": renameOrDeleteGroup,
	"delete_group": renameOrDeleteGroup,

	"create_sysvar": func(c *CCU, name string, values map[string]string) string {
		id := c.nextID()
		valueType, _ := strconv.Atoi(values["VALUE_TYPE"])
		subType, _ := strconv.Atoi(values["SUB_TYPE"])
		c.fixture.Sysvars = append(c.fixture.Sysvars, Sysvar{
			ID: id, Name: values["NAME"], Visible: true, ValueType: valueType, SubType: subType,
			Unit: values["UNIT"], Min: values["MIN"], Max: values["MAX"],
			FalseName: values["FALSE_NAME"], TrueName: values["TRUE_NAME"], ValueList: values["VALUE_LIST"],
			Value: parseRegaValue(strings.Trim(values["INITIAL"], `"`)),
		})
		return fmt.Sprintf("OK\t%d", id)
	},
	"clock_step": func(c *CCU, name string, values map[string]string) string {
		return "OK"
	},
	"edit_sysvar": func(c *CCU, name string, values map[string]string) string {
		for i := range c.fixture.Sysvars {
			if sv := &c.fixture.Sysvars[i]; strconv.FormatInt(sv.ID, 10) == values["ID"] {
				sv.Description, sv.Unit = values["INFO"], values["UNIT"]
				sv.Channel = 0
				if channel, _ := strconv.ParseInt(values["CHANNEL"], 10, 64); channel != 0 {
					for _, ch := range c.fixture.Channels {
						if ch.ID == channel {
							sv.Channel = channel
						}
					}
				}
				switch {
				case sv.ValueType == 2:
					sv.FalseName, sv.TrueName = values["FALSE_NAME"], values["TRUE_NAME"]
				case sv.SubType == 0:
					sv.Min, sv.Max = values["MIN"], values["MAX"]
					low, _ := strconv.ParseFloat(values["MIN"], 64)
					high, _ := strconv.ParseFloat(values["MAX"], 64)
					if v, ok := sv.Value.(float64); ok {
						sv.Value = math.Min(math.Max(v, low), high)
					}
				case sv.SubType == 29:
					sv.ValueList = values["VALUE_LIST"]
					high, _ := strconv.ParseFloat(values["MAX"], 64)
					if v, ok := sv.Value.(float64); ok && v > high {
						sv.Value = 0.0
					}
				}
				return "OK"
			}
		}
		return "NOT_FOUND"
	},
	"rename_sysvar": renameOrDeleteSysvar,
	"delete_sysvar": renameOrDeleteSysvar,

	"get_service_messages": func(c *CCU, name string, values map[string]string) string {
		return c.getServiceMessages()
	},
	"acknowledge_service_message": func(c *CCU, name string, values map[string]string) string {
		for _, m := range c.serviceMessages() {
			if strconv.FormatInt(m.id, 10) == values["ID"] {
				// Acknowledging ends a sticky message
				if strings.HasPrefix(m.datapoint, "STICKY_") {
					m.channel.Datapoints[m.datapoint] = false
				}
				return "OK\t" + m.datapoint
			}
		}
		return "NOT_FOUND"
	},
	"get_alarm_messages": func(c *CCU, name string, values map[string]string) string {
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
		return b.String()
	},
	"acknowledge_alarm_message": func(c *CCU, name string, values map[string]string) string {
		for i := range c.fixture.Sysvars {
			if sv := &c.fixture.Sysvars[i]; strconv.FormatInt(sv.ID, 10) == values["ID"] && sv.SubType == 6 {
				sv.receipted = true
				return "OK\t" + sv.Name
			}
		}
		return "NOT_FOUND"
	},
	"get_favorites": func(c *CCU, name string, values map[string]string) string {
		return c.getFavorites(values["USERNAME"])
	},
	"favorite_change": func(c *CCU, name string, values map[string]string) string {
		return c.changeFavorite(values)
	},
	"set_channel_mode": func(c *CCU, name string, values map[string]string) string {
		ch := c.channelByAddress(values["INTERFACE"], values["ADDRESS"])
		mode, err := strconv.Atoi(values["MODE"])
		if ch == nil || err != nil {
			return "NOT_FOUND"
		}
		ch.Mode = &mode
		return "OK"
	},
	"set_channel_option": func(c *CCU, name string, values map[string]string) string {
		id, _ := strconv.ParseInt(values["ID"], 10, 64)
		ch := c.channelByID(id)
		if ch == nil {
			return "NOT_FOUND"
		}
		value := values["VALUE"] == "true"
		switch values["OPTION"] {
		case "visible":
			ch.Hidden = !value
		case "usable":
			ch.ReadOnly = !value
		case "logged":
			ch.Logged = value
		case "aes":
			ch.AES = value
		}
		return "OK\t" + ch.Name
	},
	"get_read_only_channels": func(c *CCU, name string, values map[string]string) string {
		var b strings.Builder
		for _, ch := range c.fixture.Channels {
			if ch.ReadOnly {
				b.WriteString(ch.Address + "\n")
			}
		}
		return b.String()
	},
	"get_history": func(c *CCU, name string, values map[string]string) string {
		// Per logged channel its STATE once and 24 hourly values of its
		// numbers (LEVEL, temperature, humidity), newest first
		if c.historyCleared {
			return "N\t0\n"
		}
		only, _ := strconv.ParseInt(values["CHANNEL"], 10, 64)
		var lines []string
		now := time.Date(2026, 10, 3, 21, 0, 0, 0, time.UTC)
		n := 0
		for _, ch := range c.fixture.Channels {
			if !ch.Logged {
				continue
			}
			for _, dp := range []string{"STATE", "LEVEL", "ACTUAL_TEMPERATURE", "HUMIDITY"} {
				value, ok := ch.Datapoints[dp]
				if !ok {
					continue
				}
				steps := 24
				if dp == "STATE" {
					steps = 1
				}
				for i := 0; i < steps; i++ {
					n++
					v := value
					if f, isNumber := value.(float64); isNumber && steps > 1 {
						v = math.Round((f+math.Sin(float64(i)/3)*2)*10) / 10
					}
					if only == 0 || only == ch.ID {
						lines = append(lines, fmt.Sprintf("H\t%d\t%s\tchannel\t%s\t%s\t%v\t", n, now.Add(-time.Duration(i)*time.Hour).Format("2006-01-02 15:04:05"), ch.Name, dp, v))
					}
				}
			}
		}
		slices.SortStableFunc(lines, func(a, b string) int { return cmp.Compare(strings.Split(b, "\t")[2], strings.Split(a, "\t")[2]) })
		return fmt.Sprintf("N\t%d\n%s\n", n, strings.Join(lines, "\n"))
	},
	"clear_history": func(c *CCU, name string, values map[string]string) string {
		c.historyCleared = true
		return "OK"
	},
	"set_logic_option": func(c *CCU, name string, values map[string]string) string {
		id, _ := strconv.ParseInt(values["ID"], 10, 64)
		value := values["VALUE"] == "true"
		for i := range c.fixture.Programs {
			if p := &c.fixture.Programs[i]; p.ID == id {
				switch values["OPTION"] {
				case "visible":
					previous := p.Visible
					p.Visible = value
					return fmt.Sprintf("OK\t%t", previous)
				case "operate":
					previous := !p.ReadOnly
					p.ReadOnly = !value
					return fmt.Sprintf("OK\t%t", previous)
				}
			}
		}
		for i := range c.fixture.Sysvars {
			if sv := &c.fixture.Sysvars[i]; sv.ID == id && values["OPTION"] == "visible" {
				previous := sv.Visible
				sv.Visible = value
				return fmt.Sprintf("OK\t%t", previous)
			}
		}
		return "NOT_FOUND"
	},
	"check_script": func(c *CCU, name string, values map[string]string) string {
		code := strings.ReplaceAll(values["CODE"], `^#"^"#^`, "^")
		return checkTestScript(code)
	},
	"get_log_level": func(c *CCU, name string, values map[string]string) string {
		return strconv.Itoa(c.regaLogLevel)
	},
	"set_log_level": func(c *CCU, name string, values map[string]string) string {
		c.regaLogLevel, _ = strconv.Atoi(values["LEVEL"])
		return "OK"
	},
	"get_program": func(c *CCU, name string, values map[string]string) string {
		return c.getProgram(atoi64(values["ID"]))
	},
	"save_program": func(c *CCU, name string, values map[string]string) string {
		return c.saveProgram(values["DATA"])
	},
	"delete_program": func(c *CCU, name string, values map[string]string) string {
		for i, p := range c.fixture.Programs {
			if strconv.FormatInt(p.ID, 10) == values["ID"] {
				c.fixture.Programs = append(c.fixture.Programs[:i], c.fixture.Programs[i+1:]...)
				return "OK\t" + p.Name
			}
		}
		return "NOT_FOUND"
	},
	"get_users": func(c *CCU, name string, values map[string]string) string {
		var b strings.Builder
		for _, u := range c.users() {
			fmt.Fprintf(&b, "U\t%d\t%s\t%s\t%s\t%d\t%t\t%t\t%t\t%s\t%s\n",
				u.ID, u.Name, u.FirstName, u.LastName, u.Level, u.Password != "", u.ShowLogin, u.Name != "Admin", u.Mail, u.Phone)
		}
		fmt.Fprintf(&b, "A\t%d\n", c.autoLoginUser)
		return b.String()
	},
	"start_com_test": comTest,
	"poll_com_test":  comTest,

	"get_virtual_keys": func(c *CCU, name string, values map[string]string) string {
		var b strings.Builder
		for _, ch := range c.fixture.Channels {
			if isVirtualKey(ch.Address) {
				programs := strings.Count(c.deviceProgramUsages(strings.Split(ch.Address, ":")[0]), "\t"+ch.Address+"\n")
				fmt.Fprintf(&b, "K\t%d\t%s\t%s\t%d\t%s\n", ch.ID, ch.Address, ch.Interface, programs, ch.Name)
			}
		}
		return b.String()
	},
	"get_device_programs": func(c *CCU, name string, values map[string]string) string {
		return c.deviceProgramUsages(values["ADDRESS"])
	},
	"set_user_password": func(c *CCU, name string, values map[string]string) string {
		for i := range c.fixture.Users {
			if c.fixture.Users[i].Name == values["USERNAME"] {
				c.fixture.Users[i].Password = values["PASSWORD"]
				return "OK\t" + values["USERNAME"]
			}
		}
		return "NOT_FOUND"
	},
	"save_user": func(c *CCU, name string, values map[string]string) string {
		return c.saveUser(values)
	},
	"delete_user": func(c *CCU, name string, values map[string]string) string {
		users := c.users()
		for i, u := range users {
			if strconv.FormatInt(u.ID, 10) == values["ID"] && u.Name != "Admin" {
				c.fixture.Users = append(users[:i], users[i+1:]...)
				return "OK\t" + u.Name
			}
		}
		return "NOT_FOUND"
	},
	"get_system_settings": func(c *CCU, name string, values map[string]string) string {
		lat, lon := c.latitude, c.longitude
		if lat == "" {
			lat, lon = "52.520000", "13.405000"
		}
		return fmt.Sprintf("OK\t%s\t%s\t60.000000\t%s", lat, lon, time.Now().Format("2006-01-02 15:04:05"))
	},
	"set_location": func(c *CCU, name string, values map[string]string) string {
		c.latitude, c.longitude = values["LATITUDE"], values["LONGITUDE"]
		return "OK"
	},
	"get_build_label": func(c *CCU, name string, values map[string]string) string {
		return FakeRegaBuild
	},
	"save_system": func(c *CCU, name string, values map[string]string) string {
		return "OK"
	},
	"get_user_level": func(c *CCU, name string, values map[string]string) string {
		for _, user := range c.fixture.Users {
			if user.Name == values["USERNAME"] {
				return strconv.Itoa(user.Level)
			}
		}
		return ""
	},
}

func renameOrDeleteGroup(c *CCU, name string, values map[string]string) string {
	groups := c.groups(values["LIST_ID"])
	if groups == nil {
		return "NOT_FOUND"
	}
	for i, g := range *groups {
		if strconv.FormatInt(g.ID, 10) == values["ID"] {
			if name == "rename_group" {
				(*groups)[i].Name = values["NAME"]
			} else {
				*groups = append((*groups)[:i], (*groups)[i+1:]...)
			}
			return "OK\t" + g.Name
		}
	}
	return "NOT_FOUND"
}

func renameOrDeleteSysvar(c *CCU, name string, values map[string]string) string {
	for i, sv := range c.fixture.Sysvars {
		if strconv.FormatInt(sv.ID, 10) == values["ID"] {
			if name == "rename_sysvar" {
				c.fixture.Sysvars[i].Name = values["NAME"]
			} else {
				c.fixture.Sysvars = append(c.fixture.Sysvars[:i], c.fixture.Sysvars[i+1:]...)
			}
			return "OK\t" + sv.Name
		}
	}
	return "NOT_FOUND"
}

func comTest(c *CCU, name string, values map[string]string) string {
	// Reachable devices answer at once, unreachable ones never
	address := values["ADDRESS"]
	var maintenance *Channel
	known := false
	for i := range c.fixture.Channels {
		if deviceAddress(c.fixture.Channels[i].Address) == address {
			known = true
			if strings.HasSuffix(c.fixture.Channels[i].Address, ":0") {
				maintenance = &c.fixture.Channels[i]
			}
		}
	}
	if !known {
		return "NOT_FOUND"
	}
	if name == "start_com_test" {
		return "OK\t" + time.Now().Format("2006-01-02 15:04:05")
	}
	if maintenance != nil && maintenance.Datapoints["UNREACH"] == true {
		return "OK\t"
	}
	return "OK\t" + values["SINCE"]
}
