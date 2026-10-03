! Deletes a room or trade of the given list; its channels stay. Writes OK,
! a tab and the deleted name, or NOT_FOUND.
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
    string previousName = dom.GetObject(found).Name();
    list.Remove(found);
    dom.DeleteObject(found);
    Write("OK\t" # previousName);
} else {
    Write("NOT_FOUND");
}
