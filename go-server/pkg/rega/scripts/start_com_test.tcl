! Starts the function test of a device, as the WebUI's Device.startComTest
! does (DevStartComTest). Writes OK, a tab and the start time (the test id
! for poll_com_test.tcl), or NOT_FOUND.
string address = "{{ADDRESS}}";
string targetId = "";
string id;
foreach (id, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    if (dom.GetObject(id).Address() == address) {
        targetId = id;
    }
}
if (targetId != "") {
    object device = dom.GetObject(targetId);
    string started = system.Date("%Y-%m-%d %H:%M:%S");
    device.DevStartComTest();
    Write("OK\t" # started);
} else {
    Write("NOT_FOUND");
}
