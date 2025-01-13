object  roomObject;
string  roomId;
boolean isFirstRoom = true;

Write('{"rooms":[');

foreach (roomId, dom.GetObject(ID_ROOMS).EnumUsedIDs()) {
    if (isFirstRoom == false) {
        WriteLine(',');
    } else {
        isFirstRoom = false;
    }

    roomObject = dom.GetObject(roomId);
    Write('{"id": ' # roomId # ', "name": "');
    Write(roomObject.Name());
    Write('"}');
}

Write(']}');