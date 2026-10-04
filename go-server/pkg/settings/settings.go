// Package settings reads and writes the WebUI's general settings
// (Einstellungen → Systemsteuerung → Allgemeine Einstellungen, the
// HMServer's StorageSettingsDialog.ftl) in the CCU's config directory.
package settings

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
)

// Service works on the files in a config directory (/etc/config)
type Service struct {
	dir string
}

// New uses the config directory dir
func New(dir string) *Service {
	return &Service{dir: dir}
}

func (s *Service) path(name string) string {
	return filepath.Join(s.dir, name)
}

// EnergyPrice is the price of electricity and gas, for the costs of energy
// counters (EnergyPriceController: /etc/config/energyPrice)
type EnergyPrice struct {
	Currency string `json:"currency"`
	// Per kWh
	Electricity float64 `json:"electricity"`
	Gas         float64 `json:"gas"`
	// Of gas, to turn m³ into kWh
	GasHeatingValue    float64 `json:"gasHeatingValue"`
	GasConditionNumber float64 `json:"gasConditionNumber"`
}

// Currencies the WebUI offers (StorageSettingsDialog.ftl arCurrency)
var Currencies = []string{"EUR", "TRY", "GBP", "CHF", "PLN"}

var ErrInvalid = errors.New("invalid settings")

var lineRegex = regexp.MustCompile(`^"([A-Za-z]+)":"([^"]*)"$`)

// EnergyPrice reads the energy prices; without the file they are zero in
// euro. The first version of the file had two lines: price and currency.
func (s *Service) EnergyPrice() (EnergyPrice, error) {
	price := EnergyPrice{Currency: "EUR"}
	data, err := os.ReadFile(s.path("energyPrice"))
	if errors.Is(err, os.ErrNotExist) {
		return price, nil
	}
	if err != nil {
		return price, err
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) == 2 && !strings.Contains(lines[0], ":") {
		price.Electricity, _ = strconv.ParseFloat(strings.TrimSpace(lines[0]), 64)
		price.Currency = strings.TrimSpace(lines[1])
		return price, nil
	}
	for _, line := range lines {
		m := lineRegex.FindStringSubmatch(strings.TrimSpace(line))
		if m == nil {
			continue
		}
		value, _ := strconv.ParseFloat(strings.Replace(m[2], ",", ".", 1), 64)
		switch m[1] {
		case "currency":
			price.Currency = m[2]
		case "curPrice":
			price.Electricity = value
		case "gasPrice":
			price.Gas = value
		case "gasHeatingValue":
			price.GasHeatingValue = value
		case "gasConditionNumber":
			price.GasConditionNumber = value
		}
	}
	return price, nil
}

// SetEnergyPrice writes the energy prices as the HMServer does
func (s *Service) SetEnergyPrice(price EnergyPrice) error {
	known := false
	for _, c := range Currencies {
		known = known || c == price.Currency
	}
	for _, v := range []float64{price.Electricity, price.Gas, price.GasHeatingValue, price.GasConditionNumber} {
		if v < 0 || v > 1e6 {
			known = false
		}
	}
	if !known {
		return ErrInvalid
	}
	f := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
	content := fmt.Sprintf("\"currency\":\"%s\"\n\"curPrice\":\"%s\"\n\"gasPrice\":\"%s\"\n\"gasHeatingValue\":\"%s\"\n\"gasConditionNumber\":\"%s\"\n",
		price.Currency, f(price.Electricity), f(price.Gas), f(price.GasHeatingValue), f(price.GasConditionNumber))
	return writeFile(s.path("energyPrice"), content)
}

// InfoLED is whether the CCU3's info LED shows service messages and
// alarms (CCU.getInfoLedConfig: hss_led_info.conf)
type InfoLED struct {
	Service bool `json:"service"`
	Alarm   bool `json:"alarm"`
}

// InfoLED reads the info LED settings; both are on without the file
func (s *Service) InfoLED() InfoLED {
	led := InfoLED{Service: true, Alarm: true}
	f, err := os.Open(s.path("hss_led_info.conf"))
	if err != nil {
		return led
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		key, value, ok := strings.Cut(scanner.Text(), "=")
		ignore := strings.TrimSpace(value) == "true"
		switch strings.TrimSpace(key) {
		case "IgnoreServiceMessages":
			led.Service = !(ok && ignore)
		case "IgnoreAlarmMessages":
			led.Alarm = !(ok && ignore)
		}
	}
	return led
}

// SetInfoLED writes the info LED settings (CCU.setInfoLedConfig)
func (s *Service) SetInfoLED(led InfoLED) error {
	return writeFile(s.path("hss_led_info.conf"),
		fmt.Sprintf("IgnoreServiceMessages=%t\nIgnoreAlarmMessages=%t\n", !led.Service, !led.Alarm))
}

// Flags that are files: present means on
const (
	// Hides the service messages of devices that were unreachable
	// (CCU.getStickyUnreachState)
	HideStickyUnreach = "hideStickyUnreach"
	// Offers beta firmware for devices (activateDeviceBetaFw)
	FieldTest = "fieldTestActive"
)

// Flag reports whether a flag file exists
func (s *Service) Flag(name string) bool {
	_, err := os.Stat(s.path(name))
	return err == nil
}

// SetFlag creates or removes a flag file
func (s *Service) SetFlag(name string, on bool) error {
	if on {
		return writeFile(s.path(name), "")
	}
	if err := os.Remove(s.path(name)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// Storage is how much room the recorded diagram values take and how much
// is left on their file system
type Storage struct {
	Used  int64 `json:"used"`
	Free  int64 `json:"free"`
	Total int64 `json:"total"`
}

// StorageOf measures a directory and its file system
func StorageOf(dir string) Storage {
	var st Storage
	_ = filepath.Walk(dir, func(_ string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() {
			st.Used += info.Size()
		}
		return nil
	})
	probe := dir
	for {
		var fs syscall.Statfs_t
		if err := syscall.Statfs(probe, &fs); err == nil {
			st.Free = int64(fs.Bavail) * int64(fs.Bsize)
			st.Total = int64(fs.Blocks) * int64(fs.Bsize)
			break
		}
		parent := filepath.Dir(probe)
		if parent == probe {
			break
		}
		probe = parent
	}
	return st
}

func writeFile(path, content string) error {
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, []byte(content), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
