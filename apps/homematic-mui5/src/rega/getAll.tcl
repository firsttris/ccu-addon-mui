object  oRoom;
string  sRoomId;
string  sChannelId;
string  sDPId;
boolean bFirst       = true;
boolean bFirstSecond = true;
boolean bFirstThird  = true;

Write("[");

foreach (sRoomId, dom.GetObject(ID_ROOMS).EnumUsedIDs()) {
    if (bFirst == false) {
        WriteLine(',');
    } else {
        bFirst = false;
    }

    oRoom = dom.GetObject(sRoomId);
    Write('{"id": ' # sRoomId # ', "name": "');
    Write(oRoom.Name());
    Write('", ');
    Write('"channels":[');
    bFirstSecond = true;

    foreach(sChannelId, oRoom.EnumUsedIDs()) {
        object oChannel = dom.GetObject(sChannelId);
        if (bFirstSecond == false) {
            Write(',');
        } else {
            bFirstSecond = false;
        }
        Write('{"id": ' # sChannelId # ', "address": "' # oChannel.Address() # '", "name": "' # oChannel.Name() # '", "type": "' # oChannel.HssType() # '", "interface": "' # oChannel.Interface() # '", "datapoints":{');
        bFirstThird = true;

        foreach(sDPId, oChannel.DPs().EnumUsedIDs()) {
            object oDP = dom.GetObject(sDPId);
            if (bFirstThird == false) {
                Write(',');
            } else {
                bFirstThird = false;
            }
            Write('"' # oDP.HssType() # '": "' # oDP.Value() # '"');
        }

        Write('}}');
    }

    Write(']}');
}

Write(']');