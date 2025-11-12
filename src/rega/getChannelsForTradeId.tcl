string  tradeId = "TRADEID_PLACEHOLDER";
string  deviceId = "DEVICEID_PLACEHOLDER";
string  channelId;
string  datapointId;
boolean isFirstChannel = true;
boolean isFirstDatapoint  = true;

object functionObject = dom.GetObject(tradeId);
Write('{"deviceId":"' # deviceId # '", "channels":[');

foreach(channelId, functionObject.EnumUsedIDs()) {
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
        if (value.ToString() != "") {
            if (isFirstDatapoint == false) {
                Write(',');
            } else {
                isFirstDatapoint = false;
            }
            Write('"' # datapointObject.HssType() # '":' # value);
        }
    }

    Write('}}');
}

Write(']}');