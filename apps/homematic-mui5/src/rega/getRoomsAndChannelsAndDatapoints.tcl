object  roomObject;
string  roomId;
string  channelId;
string  datapointId;
boolean isFirstRoom       = true;
boolean isFirstChannel    = true;
boolean isFirstDatapoint  = true;

Write("[");

foreach (roomId, dom.GetObject(ID_ROOMS).EnumUsedIDs()) {
    if (isFirstRoom == false) {
        WriteLine(',');
    } else {
        isFirstRoom = false;
    }

    roomObject = dom.GetObject(roomId);
    Write('{"id": ' # roomId # ', "name": "');
    Write(roomObject.Name());
    Write('", ');
    Write('"channels":[');
    isFirstChannel = true;

    foreach(channelId, roomObject.EnumUsedIDs()) {
        object channelObject = dom.GetObject(channelId);
        if (isFirstChannel == false) {
            Write(',');
        } else {
            isFirstChannel = false;
        }
        Write('{"id": ' # channelId # ', "address": "' # channelObject.Address() # '", "name": "' # channelObject.Name() # '", "type": "' # channelObject.HssType() # '", "interface": "' # channelObject.Interface() # '", "datapoints":{');
        isFirstDatapoint = true;

        foreach(datapointId, channelObject.DPs().EnumUsedIDs()) {
            object datapointObject = dom.GetObject(datapointId);
            if (isFirstDatapoint == false) {
                Write(',');
            } else {
                isFirstDatapoint = false;
            }
            Write('"' # datapointObject.HssType() # '": "' # datapointObject.Value() # '"');
        }

        Write('}}');
    }

    Write(']}');
}

Write(']');