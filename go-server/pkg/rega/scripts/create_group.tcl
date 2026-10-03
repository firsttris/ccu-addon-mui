! Creates a room or trade and adds it to its list. Writes OK, a tab and the
! new object's id, or NOT_FOUND.
object list = dom.GetObject({{LIST_ID}});
object group = dom.CreateObject(OT_ENUM, "{{NAME}}");
if (list && group) {
    group.Name("{{NAME}}");
    group.EnumType({{ENUM_TYPE}});
    group.EnumInfo("");
    list.Add(group.ID());
    Write("OK\t" # group.ID());
} else {
    Write("NOT_FOUND");
}
