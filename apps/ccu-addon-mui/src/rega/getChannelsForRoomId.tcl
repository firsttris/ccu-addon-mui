string  roomId = "ROOMID_PLACEHOLDER";
string  channelId;
string  datapointId;
boolean isFirstChannel = true;
boolean isFirstDatapoint  = true;

object roomObject = dom.GetObject(roomId);
Write('[');
isFirstChannel = true;

foreach(channelId, roomObject.EnumUsedIDs()) {
    object channelObject = dom.GetObject(channelId);
    if (isFirstChannel == false) {
        Write(',');
    } else {
        isFirstChannel = false;
    }
    var interface = dom.GetObject(channelObject.Interface());
    var interfaceName = interface.Name();
    Write('{"id": ' # channelId # ', "address": "' # channelObject.Address() # '", "name": "' # channelObject.Name() # '", "type": "' # channelObject.HssType() # '", "interfaceName": "' # interfaceName # '", "datapoints":{');
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

Write(']');