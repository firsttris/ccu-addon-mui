object  functionObject;
string  functionId;
string  deviceId = "{{DEVICE_ID}}";
boolean isFirstFunction = true;

Write('{"deviceId":"' # deviceId # '", "trades":[');

foreach (functionId, dom.GetObject(ID_FUNCTIONS).EnumUsedIDs()) {
    if (isFirstFunction == false) {
        WriteLine(',');
    } else {
        isFirstFunction = false;
    }

    functionObject = dom.GetObject(functionId);
    Write('{"id": ' # functionId # ', "name": "');
    Write(functionObject.Name());
    Write('"}');
}

Write(']}');
