! Renames a system variable. Writes OK, a tab and the previous name, or
! NOT_FOUND.
object sv = dom.GetObject({{ID}});
if (sv) {
    if (sv.IsTypeOf(OT_VARDP) || sv.IsTypeOf(OT_ALARMDP)) {
        string previousName = sv.Name();
        sv.Name("{{NAME}}");
        Write("OK\t" # previousName);
    } else {
        Write("NOT_FOUND");
    }
} else {
    Write("NOT_FOUND");
}
