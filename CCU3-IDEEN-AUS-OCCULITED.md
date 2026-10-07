# Was der CCU3-Pfad (main) von occulited übernehmen kann

Stand: 2026-10-07. Verglichen wurden unser ReGa-/XML-RPC-Pfad auf `origin/main`
(`go-server/pkg/rega`, `pkg/xmlrpc`, `pkg/ccurpc`, `pkg/websocket`) mit dem Design
von occulited (Quelle: `github.com/hobbyquaker/occulited`, `README.md`,
`docs/system-api.md`, `docs/meta-api.md`, `docs/meta-format.md`). Alle Zeilenangaben
beziehen sich auf `origin/main`.

## 1. Wie es heute läuft (Ist-Zustand)

| Aspekt | CCU3-Pfad heute |
| --- | --- |
| getRooms / getTrades | je ein HM-Script per HTTP-POST auf `rega.exe` (`pkg/rega/rega.go:71-72, 164`) |
| getChannels(room) / getAllChannels | `scripts/get_channels.tcl` (119 Zeilen) pro Request, läuft über alle Kanäle des Raums bzw. ALLE, liest Werte aus dem ReGa-DOM, Go parst Latin1-Text (`rega.go:181`) |
| Timeouts | 10 s normal, 18 s für ALL-Läufe (`rega.go:33-34`) |
| Caching in Go | keines für Räume, Kanäle, Namen, Werte. Nur Readonly-Kanäle (30 s), LOW_BAT-Limits (1 h), Paramset-Descriptions in `ccurpc` (`ccurpc.go:350-390`) |
| Parallelität | 4 Reads parallel pro Verbindung (`websocket.go:652`), die ReGa serialisiert sie aber |
| Events | `init`-Callback pro Interface, Ping nach 1 min, Re-Init nach 6 min (`xmlrpc.go:49-51, 239`). Events gehen nur an den Browser (`main.go:157-163`), kein serverseitiges Modell |
| Schreiben | `set_datapoint.tcl` über die ReGa |

Dominierender Kostenfaktor: Jede Navigation führt ein großes interpretiertes Script auf
der single-threaded ReGa aus, auch wenn sich seit dem letzten Mal nichts geändert hat.

## 2. Was occulited anders macht

- **Letzter Wert im Speicher.** Einmalige Registrierung bei rfd/HMIPServer, letzter Wert
  jedes relevanten Datenpunkts im bbolt-Store. Ein Lesezugriff ist ein Lookup, kein
  Round-Trip.
- **Einmal seeden, dann nur Events.** Seed über `getParamset(VALUES)`; HmIP kommt aus dem
  Cache des HMIPServers, BidCos kostet pro Aufruf Funkzeit (~0,05 s, rfd schafft ca. 5/s),
  deshalb mit 200 ms Abstand („sweep“).
- **Push mit Replay.** SSE/WebSocket mit Replay-Puffer (5 min / 5000 Events), Filter nach
  Interface, Adresse und Key. Nach Reconnect fehlt nichts.
- **Metadaten als Dokument mit Revision.** Namen/Räume/Gewerke in einem `meta.json`,
  Snapshot einmal, danach `events/sse?since=<revision>`.
- **Kein Interpreter im Lesepfad.**

## 3. Konkrete Übernahmen für den CCU3-Pfad

Reihenfolge nach Nutzen/Aufwand.

### 3.1 Serverseitiger Wert-Cache (größter Hebel)

- Neues Paket, z. B. `pkg/valuecache`: `map[iface/address]map[key]Value` mit `lastChange`.
- **Füttern** aus dem bestehenden `init`-Callback: in `main.go:157` zusätzlich zum
  `BroadcastToClients` den Cache aktualisieren.
- **Seeden** beim Start und nach jedem Re-Init/Reconnect des XML-RPC-Servers:
  - HmIP: `getParamset(VALUES)` pro Kanal, frei, ggf. per `system.multicall` gebündelt.
  - BidCos-RF: gedrosselt (≥200 ms Abstand), nur für Kanäle, die die App tatsächlich
    anzeigt (Tiles/Favoriten), analog zu occulites „chosen set“.
  - Alternativ als Übergang: einmaliger ALL-Lauf des bestehenden `get_channels.tcl`
    liefert alle Werte aus dem ReGa-DOM, Cache daraus befüllen.
- **Verwenden:** `get_channels.tcl` liest dann keine `Value()` mehr; Go fügt die Werte aus
  dem Cache an. Das Script schrumpft und läuft deutlich schneller.
- **Invalidieren:** nach eigenem `SetDatapoint` den Cache optimistisch setzen; das echte
  Event bestätigt ihn.
- Bestehende Vorarbeit: `pkg/occulite/home.go:95-124` (`Seed`, `OnEvent`, `values`)
  macht genau das für lite. Das Modell lässt sich in `pkg/home` hochziehen und von
  beiden Plattformen nutzen.

### 3.2 Struktur-Cache (Räume, Gewerke, Namen, Mitgliedschaften)

- Ein ALL-Lauf (ohne Werte, siehe 3.1) liefert Kanalliste, Namen, Räume, Gewerke,
  Flags. Ergebnis in Go halten.
- getRooms/getTrades/getChannels(room) werden In-Memory-Filter.
- **Invalidierung**, weil die ReGa keine Change-Events für Namen/Räume schickt:
  - nach jedem eigenen Schreibzugriff (SetName, SetGroupMember, CreateGroup, Flags),
  - bei `newDevices`/`deleteDevices`/`updateDevice`/`replaceDevice` aus dem
    XML-RPC-Callback (kommt heute schon an, wird nur zum `Forget` der Descriptions
    genutzt),
  - per TTL (z. B. 60 s) als Fallback für Änderungen über die originale WebUI,
  - manuell über einen „Neu laden“-Request aus der App.
- Die ReGa bleibt für Schreibzugriffe und für Metadaten zuständig, die nur dort liegen
  (Kacheln, Modi, Flags).

### 3.3 Device-Liste und Descriptions cachen

- `ccurpc.ListDevices` (`ccurpc.go:293`) ruft immer per RPC; nur die Descriptions werden
  gecacht. Liste pro Interface halten und über die Device-Events invalidieren.
- Seed per `system.multicall` bündeln statt einzelner `getParamsetDescription`-Aufrufe.

### 3.4 Replay nach Reconnect

- occulited hält einen Replay-Puffer. Auf der CCU3 gibt es den nicht, aber wir können
  ihn selbst bauen: Ringpuffer der letzten N Events pro Verbindung bzw. global mit
  monoton steigender ID. Der Browser schickt beim Reconnect `lastEventID`, der Server
  spielt nach, was er noch hat, sonst schickt er den aktuellen Cache-Stand (= „resync“).
- Spart nach Netzwechseln am Handy das komplette Neuladen aller Räume.

### 3.5 Gezielter Seed statt Vollabfrage

- Wie occulite nur die Datenpunkte seeden, die die App zeichnet (Tiles, Favoriten,
  Service-Datenpunkte). Die Liste kennen wir aus unseren Tile-Definitionen.

## 4. Was wir *nicht* übernehmen sollten

- **bbolt/Persistenz des Wert-Caches:** Auf der CCU3 startet unser Add-on selten neu,
  ein In-Memory-Cache mit Seed reicht. Persistenz bringt nur I/O auf der SD-Karte.
- **Eigene `init`-Registrierung ersetzen:** haben wir bereits (`pkg/xmlrpc`), inkl.
  Ping/Re-Init. occulited macht hier nichts Besseres.
- **ReGa komplett umgehen:** Räume/Gewerke/Namen leben auf der CCU3 nur in der ReGa.
  Wir brauchen sie weiter für Schreibzugriffe und als Quelle des Struktur-Caches.

## 5. Erwarteter Effekt

- Raumwechsel: von einem ReGa-Script-Lauf (hunderte ms bis Sekunden) auf einen
  In-Memory-Filter (µs) plus ggf. einen leichten Script-Lauf im Hintergrund.
- Startseite mit Favoriten: keine ALL-Läufe mehr zur Laufzeit, der 18-s-Timeout wird
  bedeutungslos.
- Weniger Last auf der ReGa, damit reagieren auch Programme/Direktverknüpfungen der
  CCU selbst flüssiger.
