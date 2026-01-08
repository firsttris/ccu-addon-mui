var dp = dom.GetObject("{{INTERFACE}}.{{ADDRESS}}.{{ATTRIBUTE}}");
if (dp) {
  dp.State({{VALUE}});
  Write('{"success": true}');
} else {
  Write('{"success": false, "error": "Datapoint not found"}');
}
