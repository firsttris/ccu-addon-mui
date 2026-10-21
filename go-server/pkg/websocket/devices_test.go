package websocket

import (
	"errors"
	"testing"

	"ccu-addon-mui-server/pkg/ccurpc"
)

func TestListWithRetry(t *testing.T) {
	device := []ccurpc.DeviceDescription{{Address: "INT0000001"}}
	for name, tc := range map[string]struct {
		answers   []error
		wantCalls int
		wantErr   bool
	}{
		"answers at once":         {answers: []error{nil}, wantCalls: 1},
		"busy for a moment":       {answers: []error{errors.New("VirtualDevices listDevices: 503 down"), nil}, wantCalls: 2},
		"fails twice":             {answers: []error{errors.New("timeout"), errors.New("timeout")}, wantCalls: 2, wantErr: true},
		"not running: no 2nd ask": {answers: []error{errors.New("dial tcp 127.0.0.1:9292: connect: connection refused")}, wantCalls: 1, wantErr: true},
	} {
		t.Run(name, func(t *testing.T) {
			calls := 0
			list := func() ([]ccurpc.DeviceDescription, error) {
				err := tc.answers[calls]
				calls++
				if err != nil {
					return nil, err
				}
				return device, nil
			}
			got, err := listWithRetry(list, 0)
			if calls != tc.wantCalls {
				t.Errorf("asked %d times, want %d", calls, tc.wantCalls)
			}
			if (err != nil) != tc.wantErr {
				t.Errorf("err = %v, want an error: %v", err, tc.wantErr)
			}
			if !tc.wantErr && len(got) != 1 {
				t.Errorf("devices = %v, want the device", got)
			}
		})
	}
}
