! Sets a system variable. Writes OK, a tab and the previous value, or
! NOT_FOUND.
object sv = dom.GetObject({{ID}});
if (sv) {
    if (sv.IsTypeOf(OT_VARDP) || sv.IsTypeOf(OT_ALARMDP)) {
        string previousValue = sv.Value();
        sv.State({{VALUE}});
        Write("OK\t" # previousValue);
    } else {
        Write("NOT_FOUND");
    }
} else {
    Write("NOT_FOUND");
}
