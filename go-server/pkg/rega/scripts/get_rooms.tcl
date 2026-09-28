! Writes one line per room: <id> <name>, tab separated.
string roomId;
foreach (roomId, dom.GetObject(ID_ROOMS).EnumUsedIDs()) {
    WriteLine(roomId # "\t" # dom.GetObject(roomId).Name());
}
