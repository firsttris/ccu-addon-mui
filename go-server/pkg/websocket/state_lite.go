//go:build lite

package websocket

// ccuState: openccu-lite has no ReGa and no WebUI logs (state_ccu.go has
// them for a CCU)
//
//lint:ignore U1000 the Server embeds it in both builds; only the CCU's has fields
type ccuState struct{}
