! Renames a room or trade of the given list. Writes OK, a tab and the
! previous name, or NOT_FOUND.
object list = dom.GetObject({{LIST_ID}});
string groupId;
string found = "";
if (list) {
    foreach (groupId, list.EnumUsedIDs()) {
        if (groupId == "{{ID}}") {
            found = groupId;
        }
    }
}
if (found != "") {
    object group = dom.GetObject(found);
    string previousName = group.Name();
    group.Name("{{NAME}}");
    Write("OK\t" # previousName);
} else {
    Write("NOT_FOUND");
}
