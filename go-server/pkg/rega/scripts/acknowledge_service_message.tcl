! Acknowledges a service message. Writes OK, a tab and its type, or
! NOT_FOUND.
string alarmId;
string found = "";
foreach (alarmId, dom.GetObject(ID_SERVICES).EnumUsedIDs()) {
    if (alarmId == "{{ID}}") {
        found = alarmId;
    }
}
if (found != "") {
    object alarm = dom.GetObject(found);
    string type = "";
    object trigger = dom.GetObject(alarm.AlTriggerDP());
    if (trigger) {
        type = trigger.HssType();
    }
    alarm.AlReceipt();
    Write("OK\t" # type);
} else {
    Write("NOT_FOUND");
}
