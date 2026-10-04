! Tells ReGa the clock is set by hand, as cp_time.cgi's action_apply_time
! does before (dom.SettingTimeManually) and after (dom.ChangedTimeManually)
! running date. STEP is "setting" or "changed". Writes OK.
string step = "{{STEP}}";
if (step == "setting") { var a = dom.SettingTimeManually(); }
if (step == "changed") { var b = dom.ChangedTimeManually(); }
Write("OK");
