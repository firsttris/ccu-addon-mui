package rega

import (
	_ "embed"
)

//go:embed scripts/get_rooms.tcl
var getRoomsScript string

//go:embed scripts/get_trades.tcl
var getTradesScript string

//go:embed scripts/get_channels_for_room.tcl
var getChannelsForRoomScript string

//go:embed scripts/get_channels_for_trade.tcl
var getChannelsForTradeScript string

//go:embed scripts/set_datapoint.tcl
var setDatapointScript string
