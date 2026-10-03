! Writes one line per active service message (ReGa's service alarms):
!   S <id> <type> <value> <timestamp> <deviceAddress> <roomId> <roomName> <deviceName>
! The type is the datapoint that raised it (UNREACH, STICKY_UNREACH,
! LOW_BAT, CONFIG_PENDING, SABOTAGE, ERROR_CODE, ...). Read like the WebUI
! does it (rega/esp/system.fn): LastTriggerID, HSSID, AlOccurrenceTime.
string alarmId;
string roomId;
foreach (alarmId, dom.GetObject(ID_SERVICES).EnumIDs()) {
    object alarm = dom.GetObject(alarmId);
    if (alarm) {
        if (alarm.IsTypeOf(OT_ALARMDP) && (alarm.AlState() == asOncoming)) {
            object trigger = dom.GetObject(alarm.LastTriggerID());
            if (trigger) {
                object channel = dom.GetObject(trigger.Channel());
                string deviceAddress = "";
                string deviceName = "";
                string firstRoomId = "";
                string firstRoomName = "";
                if (channel) {
                    object device = dom.GetObject(channel.Device());
                    if (device) {
                        deviceAddress = device.Address();
                        deviceName = device.Name();
                        object firstChannel = dom.GetObject(device.Channels().GetAt(1));
                        if (firstChannel) {
                            foreach (roomId, firstChannel.ChnRoom()) {
                                if (firstRoomId == "") {
                                    firstRoomId = roomId;
                                    firstRoomName = dom.GetObject(roomId).Name();
                                }
                            }
                        }
                    }
                }
                WriteLine("S\t" # alarmId # "\t" # trigger.HSSID() # "\t" # trigger.Value() # "\t" # alarm.AlOccurrenceTime() # "\t" # deviceAddress # "\t" # firstRoomId # "\t" # firstRoomName # "\t" # deviceName);
            }
        }
    }
}
