! Acknowledges an alarm message, as the WebUI's ReceiptAlarm
! (rega/esp/functions.fn): only when its trigger can be written, or when
! it has none. Writes OK, a tab and its name, or NOT_FOUND.
object sv = dom.GetObject({{ID}});
if (sv) {
    if (sv.IsTypeOf(OT_ALARMDP)) {
        object trigger = dom.GetObject(sv.AlTriggerDP());
        if (trigger) {
            if (trigger.Operations() & OPERATION_WRITE) {
                sv.AlReceipt();
            }
        } else {
            sv.AlReceipt();
        }
        Write("OK\t" # sv.Name());
    } else {
        Write("NOT_FOUND");
    }
} else {
    Write("NOT_FOUND");
}
