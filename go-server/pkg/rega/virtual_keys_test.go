package rega

import "testing"

func TestParseVirtualKeys(t *testing.T) {
	keys := parseVirtualKeys("K\t1101\tBidCoS-RF:1\tBidCos-RF\t2\tAlles aus\nK\t1102\tBidCoS-RF:2\tBidCos-RF\t0\tHM-RCV-50 BidCoS-RF:2\nbad\n")
	if len(keys) != 2 || keys[0].Name != "Alles aus" || keys[0].Programs != 2 || keys[1].InterfaceName != "BidCos-RF" {
		t.Fatalf("got %+v", keys)
	}
}
