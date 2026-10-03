package rega

import "testing"

func TestComTestRefusesUnsafeInput(t *testing.T) {
	c := &Client{}
	if _, _, err := c.StartComTest(`x"; system.Exec("rm`); err == nil {
		t.Error("expected an error for the address")
	}
	if _, _, err := c.PollComTest("LEQ0000001", `2026"; x`); err == nil {
		t.Error("expected an error for the start time")
	}
}
