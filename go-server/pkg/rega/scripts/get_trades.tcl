! Writes one line per trade: <id> <name>, tab separated.
string functionId;
foreach (functionId, dom.GetObject(ID_FUNCTIONS).EnumUsedIDs()) {
    WriteLine(functionId # "\t" # dom.GetObject(functionId).Name());
}
