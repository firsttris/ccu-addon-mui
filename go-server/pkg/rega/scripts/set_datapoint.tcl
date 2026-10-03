! Writes OK (followed by a tab and the previous value), NOT_FOUND or
! UNREACH. A command for an unreachable device is not sent: it would fail
! (or be queued) without the user noticing.
object datapointObject = dom.GetObject("{{INTERFACE}}.{{ADDRESS}}.{{ATTRIBUTE}}");
object unreachObject = dom.GetObject("{{INTERFACE}}.{{DEVICE_ADDRESS}}:0.UNREACH");
boolean unreachable = false;
if (unreachObject) {
    if (unreachObject.Value() == true) {
        unreachable = true;
    }
}
if (datapointObject) {
    if (unreachable) {
        Write("UNREACH");
    } else {
        string previousValue = datapointObject.Value();
        datapointObject.State({{VALUE}});
        Write("OK\t" # previousValue);
    }
} else {
    Write("NOT_FOUND");
}
