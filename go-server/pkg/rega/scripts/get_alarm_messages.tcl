! Writes one line per alarm message, as the WebUI's alarm page lists them
! (rega/pages/tabs/statusviews/alarmMessages.htm): alarm system variables
! that are oncoming, i.e. triggered and not yet acknowledged.
!   A <id> <active> <counter> <firstTime> <lastTime> <triggerChannel> <roomName> <message> <name>
! <active> is the variable's current state; <message> its value name.
string svId;
foreach (svId, dom.GetObject(ID_SYSTEM_VARIABLES).EnumIDs()) {
    object sv = dom.GetObject(svId);
    if (sv) {
        if (sv.IsTypeOf(OT_ALARMDP) && (sv.AlState() == asOncoming)) {
            string channelName = "";
            string roomName = "";
            integer triggerId = sv.LastTriggerID();
            if ((triggerId == ID_ERROR) || (triggerId == 0)) {
                triggerId = sv.AlTriggerDP();
            }
            object trigger = dom.GetObject(triggerId);
            if (trigger) {
                object channel = dom.GetObject(trigger.Channel());
                if (channel) {
                    channelName = channel.Name();
                    string roomId;
                    foreach (roomId, channel.ChnRoom()) {
                        if (roomName == "") {
                            roomName = dom.GetObject(roomId).Name();
                        }
                    }
                }
            }
            string message = sv.ValueName0();
            if (sv.State() == true) {
                message = sv.ValueName1();
            }
            WriteLine("A\t" # sv.ID() # "\t" # sv.State() # "\t" # sv.AlCounter() # "\t" # sv.AlOccurrenceTime() # "\t" # sv.Timestamp() # "\t" # channelName # "\t" # roomName # "\t" # message # "\t" # sv.Name());
        }
    }
}
