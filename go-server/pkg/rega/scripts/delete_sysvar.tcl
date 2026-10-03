! Deletes a system variable. Writes OK, a tab and its name, or NOT_FOUND.
object list = dom.GetObject(ID_SYSTEM_VARIABLES);
object sv = dom.GetObject({{ID}});
if (list && sv) {
    if (sv.IsTypeOf(OT_VARDP) || sv.IsTypeOf(OT_ALARMDP)) {
        string previousName = sv.Name();
        list.Remove(sv.ID());
        dom.DeleteObject(sv.ID());
        Write("OK\t" # previousName);
    } else {
        Write("NOT_FOUND");
    }
} else {
    Write("NOT_FOUND");
}
