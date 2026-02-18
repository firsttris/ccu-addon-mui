package subscriptions

import (
	"sort"
	"testing"

	"ccu-addon-mui-server/pkg/types"
)

func TestSubscribeAndShouldReceiveEvent(t *testing.T) {
	mgr := NewManager()
	mgr.Subscribe("device-1", []string{"A:B:C:1", "A:B:C:2", "A:B:C:2"})

	if !mgr.ShouldReceiveEvent("device-1", &types.CCUEvent{Event: types.Event{Channel: "A:B:C:1"}}) {
		t.Fatal("expected subscribed channel to receive event")
	}
	if mgr.ShouldReceiveEvent("device-1", &types.CCUEvent{Event: types.Event{Channel: "A:B:C:9"}}) {
		t.Fatal("expected non-subscribed channel not to receive event")
	}
	if mgr.ShouldReceiveEvent("unknown-device", &types.CCUEvent{Event: types.Event{Channel: "A:B:C:1"}}) {
		t.Fatal("expected unknown device not to receive event")
	}

	channels := mgr.GetSubscriptions("device-1")
	sort.Strings(channels)
	if len(channels) != 2 {
		t.Fatalf("expected duplicate channels to be de-duplicated to 2, got %d", len(channels))
	}
	if channels[0] != "A:B:C:1" || channels[1] != "A:B:C:2" {
		t.Fatalf("unexpected subscriptions: %v", channels)
	}
}

func TestUnsubscribeAndStats(t *testing.T) {
	mgr := NewManager()
	mgr.Subscribe("device-1", []string{"X:1", "X:2"})
	mgr.Subscribe("device-2", []string{"Y:1"})

	stats := mgr.GetStats()
	if stats.Devices != 2 || stats.TotalChannels != 3 {
		t.Fatalf("unexpected stats before unsubscribe: %+v", stats)
	}

	mgr.Unsubscribe("device-1")

	stats = mgr.GetStats()
	if stats.Devices != 1 || stats.TotalChannels != 1 {
		t.Fatalf("unexpected stats after unsubscribe: %+v", stats)
	}

	if got := mgr.GetSubscriptions("device-1"); len(got) != 0 {
		t.Fatalf("expected no subscriptions for unsubscribed device, got %v", got)
	}
}
