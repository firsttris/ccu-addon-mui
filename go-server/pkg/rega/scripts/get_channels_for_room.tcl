string  roomId = "{{ROOM_ID}}";
string  deviceId = "{{DEVICE_ID}}";
string  channelId;
string  datapointId;
boolean isFirstChannel = true;
boolean isFirstDatapoint  = true;

object roomObject = dom.GetObject(roomId);
Write('{"deviceId":"' # deviceId # '", "channels":[');
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
        var value = datapointObject.Value();
        if (isFirstDatapoint == false) {
            Write(',');
        } else {
            isFirstDatapoint = false;
        }
        Write('"' # datapointObject.HssType() # '":');
        if (value.ToString() == "") {
            Write('null');
        } else {
            integer valueType = datapointObject.ValueType();
            if ((valueType == 2) || (valueType == 4) || (valueType == 16)) {
                Write(value);
            } else {
                Write('"' # value # '"');
            }
        }
    }

    Write('}}');
}

Write(']}');
