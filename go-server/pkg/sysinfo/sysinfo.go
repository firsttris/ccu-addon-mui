// Package sysinfo reads what the WebUI's help page shows about the CCU
// (OpenCCU's www/config/help.cgi): hardware, memory, load, temperature,
// operating system, network status and free space. Only files are read, no
// programs run; what is missing stays empty.
package sysinfo

import (
	"bufio"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

// Root prefixes every path, for tests
var Root = ""

// Info is the CCU's hardware and system state
type Info struct {
	Model  string `json:"model,omitempty"`
	Serial string `json:"serial,omitempty"`
	CPUs   int    `json:"cpus"`
	// Bytes, and the share in use in percent
	MemoryTotal int64    `json:"memoryTotal,omitempty"`
	MemoryUsed  *float64 `json:"memoryUsed,omitempty"`
	SwapUsed    *float64 `json:"swapUsed,omitempty"`
	// Seconds since the start
	Uptime int64 `json:"uptime,omitempty"`
	// The 1, 5 and 15 minute load averages
	Load        string   `json:"load,omitempty"`
	Temperature *float64 `json:"temperature,omitempty"`
	OS          string   `json:"os,omitempty"`
	Kernel      string   `json:"kernel,omitempty"`
	// IP, Internet, Link, NTP, SD: /var/status/has<Name>
	Status []Flag `json:"status"`
	// Bytes free and in total on the root and the user file system
	RootFree  int64 `json:"rootFree,omitempty"`
	RootTotal int64 `json:"rootTotal,omitempty"`
	UserFree  int64 `json:"userFree,omitempty"`
	UserTotal int64 `json:"userTotal,omitempty"`
}

// Flag is one network status of /var/status
type Flag struct {
	Name string `json:"name"`
	On   bool   `json:"on"`
}

func path(p string) string { return filepath.Join(Root, p) }

func readTrimmed(p string) string {
	data, err := os.ReadFile(path(p))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.TrimRight(string(data), "\x00"))
}

// shellVars reads KEY=value lines as help.cgi's loadVarsFromShellFile
func shellVars(p string) map[string]string {
	vars := map[string]string{}
	f, err := os.Open(path(p))
	if err != nil {
		return vars
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		key, value, ok := strings.Cut(strings.TrimSpace(scanner.Text()), "=")
		if ok && key != "" && !strings.ContainsAny(key, " \t") {
			vars[key] = strings.Trim(value, `"'`)
		}
	}
	return vars
}

// model as help.cgi: the device tree, else the DMI board or system, else
// the Model line of /proc/cpuinfo
func model() string {
	if m := readTrimmed("/proc/device-tree/model"); m != "" {
		return m
	}
	for _, pair := range [][2]string{{"board_vendor", "board_name"}, {"sys_vendor", "product_name"}} {
		if vendor := readTrimmed("/sys/devices/virtual/dmi/id/" + pair[0]); vendor != "" {
			return strings.TrimSpace(vendor + " " + readTrimmed("/sys/devices/virtual/dmi/id/"+pair[1]))
		}
	}
	data, _ := os.ReadFile(path("/proc/cpuinfo"))
	for _, line := range strings.Split(string(data), "\n") {
		if key, value, ok := strings.Cut(line, ":"); ok && strings.TrimSpace(key) == "Model" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// serial as help.cgi: the HmIP radio module's, else the board's
func serial() string {
	if s := shellVars("/var/hm_mode")["HM_HMIP_SERIAL"]; s != "" {
		return s
	}
	for _, p := range []string{"/var/board_sgtin", "/var/board_serial", "/sys/module/plat_eq3ccu2/parameters/board_serial"} {
		if s := readTrimmed(p); s != "" {
			return s
		}
	}
	return ""
}

func meminfo() map[string]int64 {
	values := map[string]int64{}
	data, _ := os.ReadFile(path("/proc/meminfo"))
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			if n, err := strconv.ParseInt(fields[1], 10, 64); err == nil {
				values[strings.TrimSuffix(fields[0], ":")] = n * 1024
			}
		}
	}
	return values
}

func share(used, total int64) *float64 {
	if total <= 0 {
		return nil
	}
	v := float64(used) / float64(total) * 100
	return &v
}

func space(p string) (free, total int64) {
	var fs syscall.Statfs_t
	if err := syscall.Statfs(path(p), &fs); err != nil {
		return 0, 0
	}
	return int64(fs.Bavail) * int64(fs.Bsize), int64(fs.Blocks) * int64(fs.Bsize)
}

// Read collects the state
func Read() Info {
	info := Info{Model: model(), Serial: serial(), CPUs: runtime.NumCPU(), Status: []Flag{}}
	mem := meminfo()
	info.MemoryTotal = mem["MemTotal"]
	info.MemoryUsed = share(mem["MemTotal"]-mem["MemAvailable"], mem["MemTotal"])
	info.SwapUsed = share(mem["SwapTotal"]-mem["SwapFree"], mem["SwapTotal"])
	if fields := strings.Fields(readTrimmed("/proc/uptime")); len(fields) > 0 {
		if seconds, err := strconv.ParseFloat(fields[0], 64); err == nil {
			info.Uptime = int64(seconds)
		}
	}
	if fields := strings.Fields(readTrimmed("/proc/loadavg")); len(fields) >= 3 {
		info.Load = strings.Join(fields[:3], " ")
	}
	if milli, err := strconv.ParseFloat(readTrimmed("/sys/class/thermal/thermal_zone0/temp"), 64); err == nil {
		celsius := milli / 1000
		info.Temperature = &celsius
	}
	info.OS = shellVars("/etc/os-release")["PRETTY_NAME"]
	if release := readTrimmed("/proc/sys/kernel/osrelease"); release != "" {
		info.Kernel = strings.TrimSpace(readTrimmed("/proc/sys/kernel/ostype") + " " + release + " " + runtime.GOARCH)
	}
	for _, name := range []string{"IP", "Internet", "Link", "NTP", "SD"} {
		_, err := os.Stat(path("/var/status/has" + name))
		info.Status = append(info.Status, Flag{Name: name, On: err == nil})
	}
	info.RootFree, info.RootTotal = space("/")
	info.UserFree, info.UserTotal = space("/usr/local")
	return info
}
