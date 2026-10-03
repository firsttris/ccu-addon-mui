! Writes the location and clock of the CCU, read as the WebUI's
! system.getPositionData reads them (api/methods/system/getpositiondata.tcl):
! OK, latitude, longitude, time zone offset and the CCU time, tab-separated.
Write("OK\t" # system.Latitude() # "\t" # system.Longitude() # "\t" # system.TimeZoneOffset() # "\t" # system.Date("%Y-%m-%d %H:%M:%S"));
