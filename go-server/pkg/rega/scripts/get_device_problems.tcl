! Writes one line per device with a battery or reachability problem:
!   P <address> <lowBat> <unreach> <roomId> <roomName> <name>
! Virtual devices (heating groups) are skipped: they only repeat the status
! of their members.
string deviceId;
string datapointId;
string roomId;
boolean lowBat;
boolean unreach;
string firstRoomId;
string firstRoomName;

foreach (deviceId, dom.GetObject(ID_DEVICES).EnumUsedIDs()) {
    object deviceObject = dom.GetObject(deviceId);
    object interfaceObject = dom.GetObject(deviceObject.Interface());
    object statusChannel = dom.GetObject(deviceObject.Channels().GetAt(0));
    if (interfaceObject && statusChannel) {
        if (interfaceObject.Name() != "VirtualDevices") {
            lowBat = false;
            unreach = false;
            foreach (datapointId, statusChannel.DPs().EnumUsedIDs()) {
                object datapointObject = dom.GetObject(datapointId);
                string statusType = datapointObject.HssType();
                if (datapointObject.Value() == true) {
                    if ((statusType == "LOW_BAT") || (statusType == "LOWBAT")) {
                        lowBat = true;
                    }
                    if (statusType == "UNREACH") {
                        unreach = true;
                    }
                }
            }

            if (lowBat || unreach) {
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
                WriteLine("P\t" # deviceObject.Address() # "\t" # lowBat # "\t" # unreach # "\t" # firstRoomId # "\t" # firstRoomName # "\t" # deviceObject.Name());
            }
        }
    }
}
