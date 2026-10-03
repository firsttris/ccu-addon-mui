! Sets the location used for sunrise and sunset, as the WebUI's cp_time.cgi
! does (set_location_config). Writes OK.
var x = system.Longitude({{LONGITUDE}});
var y = system.Latitude({{LATITUDE}});
var a = dom.ChangedTimeManually();
Write("OK");
