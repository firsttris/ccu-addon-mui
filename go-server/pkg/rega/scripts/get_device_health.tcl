! Writes one line per device with the values of its maintenance channel
! (channel 0) that tell its health, each with the time it was last set:
!   H <address> <type> <interface> <roomId> <roomName> <values> <name>
! <values> is KEY=value@unixtime;... for LOW_BAT/LOWBAT, OPERATING_VOLTAGE,
! RSSI_DEVICE, RSSI_PEER, UNREACH, STICKY_UNREACH, CONFIG_PENDING,
! UPDATE_PENDING, DUTY_CYCLE and SABOTAGE. Virtual devices (heating groups)
! are skipped, as in get_device_problems.tcl.
string deviceId;
string datapointId;
string roomId;
string values;
string firstRoomId;
string firstRoomName;
string wanted = ",LOW_BAT,LOWBAT,OPERATING_VOLTAGE,RSSI_DEVICE,RSSI_PEER,UNREACH,STICKY_UNREACH,CONFIG_PENDING,UPDATE_PENDING,DUTY_CYCLE,SABOTAGE,";

foreach (deviceId, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    object deviceObject = dom.GetObject(deviceId);
    object interfaceObject = dom.GetObject(deviceObject.Interface());
    object statusChannel = dom.GetObject(deviceObject.Channels().GetAt(0));
    if (interfaceObject && statusChannel) {
        if (interfaceObject.Name() != "VirtualDevices") {
            values = "";
            foreach (datapointId, statusChannel.DPs().EnumUsedIDs()) {
                object datapointObject = dom.GetObject(datapointId);
                string statusType = datapointObject.HssType();
                if (wanted.Find("," # statusType # ",") >= 0) {
                    values = values # statusType # "=" # datapointObject.Value() # "@" # datapointObject.Timestamp().ToInteger() # ";";
                }
            }
            firstRoomId = "";
            firstRoomName = "";
            object firstChannel = dom.GetObject(deviceObject.Channels().GetAt(1));
            if (firstChannel) {
                foreach (roomId, firstChannel.ChnRoom()) {
                    if (firstRoomId == "") {
                        object roomObject = dom.GetObject(roomId);
                        firstRoomId = roomId;
                        firstRoomName = roomObject.Name();
                    }
                }
            }
            WriteLine("H\t" # deviceObject.Address() # "\t" # deviceObject.HssType() # "\t" # interfaceObject.Name() # "\t" # firstRoomId # "\t" # firstRoomName # "\t" # values # "\t" # deviceObject.Name());
        }
    }
}
