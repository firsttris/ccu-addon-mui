! Writes OK (followed by a tab and the previous value) or NOT_FOUND.
! Sent also to a device marked unreachable, as the WebUI does (setDpState,
! setvalue.tcl): with HmIP battery devices UNREACH is often stale, and the
! command is what brings the device back.
object datapointObject = dom.GetObject("{{INTERFACE}}.{{ADDRESS}}.{{ATTRIBUTE}}");
if (datapointObject) {
    string previousValue = datapointObject.Value();
    datapointObject.State({{VALUE}});
    Write("OK\t" # previousValue);
} else {
    Write("NOT_FOUND");
}
