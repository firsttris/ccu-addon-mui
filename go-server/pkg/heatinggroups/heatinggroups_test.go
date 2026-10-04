package heatinggroups

import (
	"os"
	"path/filepath"
	"testing"
)

// The groups as an OpenCCU issue shows them (OpenCCU#2364)
const sample = `{"groups":[{"id":1,"groupMembers":[{"memberType":{"id":"RADIATOR_THERMOSTAT"},"properties":{},"id":"0001D3C99CA0D2:1"}],"groupType":{"id":"hmip.heating.group","label":"HmIP-Heizungssteuerung","version":131072},"groupProperties":{"FORBID_SINGLE_OPERATION":false,"GROUP_DEVICE_NAME":"IP-Gruppe-1-BX INT0000001","NAME":"IP-Gruppe-1-BX"}},{"id":7,"groupMembers":[],"groupType":{"id":"HomeMatic.heating","label":"Heating_Control","version":3},"groupProperties":{"FORBID_SINGLE_OPERATION":true,"GROUP_DEVICE_NAME":"HM-Test-Gruppe-2-BX ","NAME":"HM-Test-Gruppe-2-BX"}}]}`

func TestRead(t *testing.T) {
	dir := t.TempDir()
	if _, err := Read(filepath.Join(dir, "missing")); err != ErrNoFile {
		t.Fatalf("expected ErrNoFile, got %v", err)
	}
	path := filepath.Join(dir, "groups.gson")
	_ = os.WriteFile(path, []byte(sample), 0o644)
	groups, err := Read(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 {
		t.Fatalf("expected 2 groups, got %+v", groups)
	}
	ip := groups[0]
	if ip.Name != "IP-Gruppe-1-BX" || ip.Type != "hmip.heating.group" || ip.DeviceAddress != "INT0000001" || ip.ForbidSingleOperation {
		t.Fatalf("unexpected group: %+v", ip)
	}
	if len(ip.Members) != 1 || ip.Members[0].Address != "0001D3C99CA0D2:1" || ip.Members[0].Type != "RADIATOR_THERMOSTAT" {
		t.Fatalf("unexpected members: %+v", ip.Members)
	}
	hm := groups[1]
	if hm.DeviceAddress != "" || hm.DeviceName != "HM-Test-Gruppe-2-BX" || !hm.ForbidSingleOperation || len(hm.Members) != 0 {
		t.Fatalf("unexpected group: %+v", hm)
	}
	_ = os.WriteFile(path, []byte("{broken"), 0o644)
	if _, err := Read(path); err == nil {
		t.Fatal("a broken file must be reported")
	}
}
