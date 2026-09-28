! Writes one line per channel and per datapoint, tab separated:
!   C <id> <address> <type> <interfaceName> <name>
!   D <type> <valueType> <value>
! The JSON is built in Go, so names and values need no escaping here.
string objectId = "{{OBJECT_ID}}";
string channelId;
string datapointId;

object parentObject = dom.GetObject(objectId);
if (parentObject) {
    foreach (channelId, parentObject.EnumUsedIDs()) {
        object channelObject = dom.GetObject(channelId);
        object interfaceObject = dom.GetObject(channelObject.Interface());
        WriteLine("C\t" # channelId # "\t" # channelObject.Address() # "\t" # channelObject.HssType() # "\t" # interfaceObject.Name() # "\t" # channelObject.Name());

        foreach (datapointId, channelObject.DPs().EnumUsedIDs()) {
            object datapointObject = dom.GetObject(datapointId);
            WriteLine("D\t" # datapointObject.HssType() # "\t" # datapointObject.ValueType() # "\t" # datapointObject.Value());
        }
    }
}
