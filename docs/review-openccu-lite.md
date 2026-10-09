# Code-Review: openccu-lite-Unterstützung (PR #191)

Stand: 9. Oktober 2026, Branch `claude/sweet-goldberg-72zf4r-openccu-lite` auf Commit `7032098`,
verglichen mit `origin/main` (`1d8d392`). 147 Dateien, +8732/−588 Zeilen, 55 Commits.

Geprüft wurde gegen die Quellen von [occulited](https://github.com/hobbyquaker/occulited)
(`docs/system-api.md`, `docs/meta-api.md`, `docs/lite-rpc-methods.json`) und
[openccu-lite](https://github.com/hobbyquaker/openccu-lite), jeweils `main` von heute. Beide Builds
(`go build`, `go build -tags lite`), `go vet` für beide und `go test -tags lite ./...` laufen sauber durch.
Die Frontend-Tests (vitest, Playwright) konnte ich hier nicht ausführen (keine `node_modules`).

---

## 0. Gegenprüfung und Umsetzung

Jeder Punkt unten wurde ein zweites Mal gegen den Code von PR #191 (`7032098`) und gegen occulited's Quellen
geprüft (`internal/devstate/keys.go`, `internal/meta/store.go`, `docs/*.md`). Drei Aussagen der ersten
Fassung waren falsch oder übertrieben; sie sind unten korrigiert und hier markiert. Die bestätigten Punkte
behebt der Pull Request, der dieses Dokument enthält, jeweils mit einem Test, der ohne den Fix scheitert.

| Punkt | Ergebnis der Gegenprüfung | Umgesetzt |
|---|---|---|
| 4.1 WebSocket-Pfad ohne Rückfall | **Bestätigt.** `update_script` sagt selbst: ohne `S50lighttpd reload` gilt der neue Pfad erst nach einem Neustart; bis dahin verbindet sich die App nicht. | App fällt auf `/ws/mui` zurück, solange keine Verbindung offen war (`useWebsocket.tsx`, Test in `useWebsocket.test.tsx`) |
| 4.2 Gate-Fehler = „Sitzung abgelaufen" | **Bestätigt.** Ein Fehler von occulited beim Verbindungsaufbau führt zu `SESSION_REQUIRED` und zur Anmeldeseite. | Server fragt beim Login erneut, antwortet sonst `SYSTEM_UNAVAILABLE`; die App fragt nach 3 s wieder (`gate.go`, Tests in `gate_test.go` und `useWebsocket.test.tsx`) |
| 4.3 Default-Werte | **Teilweise falsch.** occulites Zustandsspeicher führt `STATE`, `LEVEL` und alle Werte, die Kacheln zeigen (`devstate/keys.go`): die eingeschaltete Lampe erscheint nicht als aus. Richtig bleibt: Datenpunkte außerhalb dieser Liste (z. B. `SECTION`, `PROCESS`) eines HmIP-Kanals wurden nie nachgelesen, sobald der Speicher einen Wert des Kanals kannte. | HmIP- und virtuelle Kanäle werden einmal nachgelesen, ohne Werte des Speichers zu überschreiben (`home.go readValues`, Test `TestReadValuesFillsWhatTheStateStoreLacks`) |
| 4.4 `since` bei Typwechsel | **Ohne Auswirkung.** `since` wird nur für Kanal 0 genutzt (Gerätegesundheit), und Kanal 0 wird nie per `getParamset` gelesen: Seine Werte kommen immer als JSON. | Nichts |
| 4.5 Layouts der Unterräume | **Bestätigt.** occulited schickt beim Löschen eines Teilbaums ein einziges `node.deleted` (`internal/meta/store.go`, `DeleteNode`). | Die Unterräume werden aus dem zuletzt gelesenen Snapshot ermittelt (`metastream.go`, Tests `TestDeletedNodeTakesTheLayoutsBelow`, `TestLiteLayoutsFollowRoomsMovedInOpenccuLite`) |
| 4.6 `lastID` bei `resync` | **Bestätigt, harmlos.** | Eine Zeile (`main_lite.go`) |
| 4.7 Streams ohne Header-Timeout | **Header-Timeout bestätigt. Die Aussage zu `time.After` war falsch:** seit Go 1.23 werden nicht mehr referenzierte Timer sofort freigegeben (das Modul nutzt Go 1.27). | `ResponseHeaderTimeout` für beide Streams (`client.go`, Test `TestStreamWaitsForItsHeadersOnlySoLong`) |
| 4.8 `useAlarmMessages` | **Bestätigt.** | `useCapabilities()` |
| 4.9 Toter Code | **Bestätigt.** | Entfernt |
| 4.10 Lizenztext „MIT" | **Bestätigt, aber schon auf `main`.** | Nicht hier: gehört in einen eigenen PR gegen `main` |
| 5.1 Polling-Angaben | **Teilweise übertrieben.** Posteingang (3 s) und Anlernstatus (1 s) pollen nur, solange der Anlernmodus läuft; die Servicemeldungen liest der Server alle 5 Minuten und bei Wartungs-Events, nicht „alle paar Sekunden". | — |
| 5.2.1 Snapshot cachen | **Bestätigt.** | Gehalten, solange der Metadaten-Stream verbunden ist; jedes Event und jede eigene Änderung verwirft ihn (`cache.go`, Tests `TestSnapshotKeptWhileTheStreamIsConnected`, `TestLiteKeepsSnapshotAndDeviceLists`) |
| 5.2.2 `listDevices` cachen | **Bestätigt.** | Gehalten, solange lite-rpc's Event-Stream läuft; Geräte- und `interface`-Events verwerfen die Liste der Schnittstelle, `resync` alle (`cache.go`, `main_lite.go`, dieselben Tests) |
| 5.2.3–5.2.8 | Zutreffend, aber im Verhältnis klein: `roomOf` kostet bei 100 Geräten und 500 Objekten ~50 000 Präfixvergleiche pro Minute, die Token-Datei liegt im RAM (`/run`), `WithToken` teilt den Transport. | Nichts; nach den beiden Caches nicht mehr der Engpass |
| 7. Fehlende Tests | **Bestätigt.** | Fake-occulited hat jetzt den Metadaten-Stream, verschachtelte Räume mit Verschieben und Löschen, `resync` und Geräte-Events; neue Integrationstests für Verschieben, Caches und `resync`, Unit-Tests für Gate-Wiederholung und Stufenwechsel |

Nebenbei aufgefallen und mit behoben: Der Server wartete beim Beenden nicht auf das Folgen des
Metadaten-Streams, das zum Schluss noch die Revision schreibt (`main.go platformHooks.stop`).

## 1. Gesamturteil

**Die Integration ist architektonisch sauber gelöst und im Kern korrekt.** Die beiden Plattformen sind
nicht durch `if lite`-Verzweigungen im Code verstreut, sondern über drei Mechanismen getrennt:

1. **Build-Tags** (`//go:build lite` / `!lite`) für alles, was es nur auf der CCU gibt.
2. **Eine Schnittstelle `home.Source`** für das Hausmodell, die ReGa (`pkg/rega`) und occulited
   (`pkg/occulite`) beide erfüllen.
3. **Capabilities**, die der Server beim Login mitschickt und nach denen sich die App richtet.

Die API-Aufrufe stimmen mit occulited's Dokumentation überein (Pfade, Scopes, Event-Format, Heizgruppen,
Meta-Stream). Das Rechtemodell (Token des Add-ons nur zum Lesen, Änderungen mit der Sitzung des Nutzers,
`administer`-Sperre für Löschen/Ersetzen/Firmware/Heizgruppen) ist konsequent umgesetzt.

**Der größte Schwachpunkt ist die Performance des Lite-Hausmodells.** Es cached nichts: jede Anfrage nach
Kanälen eines Raums holt den kompletten Metadaten-Snapshot und ruft `listDevices` auf allen
Funkschnittstellen über lite-rpc auf. Beim ersten Laden kommen pro Kanal noch `getParamsetDescription`
und `getParamset` hinzu, sequenziell. Auf einer Installation mit 50+ Geräten wird das spürbar
(siehe Abschnitt 5). Das ist kein Blocker für den Merge, sollte aber vor einem breiten Rollout
angegangen werden.

Echte Fehler habe ich wenige gefunden, keinen, der Daten zerstört. Die wichtigsten stehen in Abschnitt 4.

---

## 2. Architektur: Wie es gemacht ist

### 2.1 Ein Branch, zwei Binaries (Build-Tags)

| Datei | Tag | Inhalt |
|---|---|---|
| `go-server/main_ccu.go` | `!lite` | ReGa-Client, CCU-Auth, Backup, Add-ons, Self-Update, Logs, Settings, Sysvar-Watch |
| `go-server/main_lite.go` | `lite` | occulite-Client, Hausmodell, Gate, Heizgruppen über occulited, Event-Stream statt Callback-Server |
| `pkg/websocket/dispatch_ccu.go` | `!lite` | Verteiler für ~50 Nachrichtentypen, die nur die CCU hat |
| `pkg/websocket/dispatch_lite.go` | `lite` | `return false` |
| `pkg/websocket/routes_ccu.go` / `routes_lite.go` | | HTTP-Routen (Backup, Restore, Logs) und `autoLoginUser`, `SetRega` |
| 20+ Handler-Dateien (`gateways.go`, `history.go`, `logging.go`, `sysvars.go`, …) | `!lite` | werden im Lite-Binary gar nicht kompiliert |

`main.go` kennt die Plattform nur über `setupPlatform()` und `platformHooks` (Event-Quelle,
Diagramm-Recording, Start-Hook). Das ist ein guter Schnitt: Der gemeinsame Teil (`run()`) ist
plattformneutral, und jedes Binary enthält nur, was es braucht.

**Bewertung:** Richtig gewählt. Zwei Pakete sind für den Nutzer eindeutig (`update_script` bricht mit
`exit 2` ab, wenn das falsche Paket installiert wird), und der Compiler erzwingt, dass CCU-Handler im
Lite-Build nicht erreichbar sind. Die Einschränkung, die der Plan selbst nennt (der ReGa-Client steckt
noch als Feld in `websocket.Server`), ist real, aber harmlos: `s.regaClient` ist auf Lite `nil` und wird
nur an Stellen angefasst, die der Verteiler dort nicht erreicht (siehe 2.4 für die Ausnahmen).

### 2.2 Die Schnittstelle `home.Source`

`pkg/home/source.go` definiert 22 Methoden: Räume, Gewerke, Kanäle, Namen, Gruppen,
Datenpunkt setzen, Geräteprobleme/-gesundheit, Posteingang, Kanalmodus, Favoriten, Servicemeldungen,
Nur-Lese-Kanäle. Die Datentypen (`Channel`, `Favorite`, `ServiceMessage`, …) sind nach `pkg/home/types.go`
gewandert; `pkg/rega` behält sie als Typ-Aliase (`type Channel = home.Channel`), so dass der bestehende
CCU-Code unverändert weiterläuft. `rega/source_test.go` und `occulite/home.go:63` sichern per
`var _ home.Source = …` ab, dass beide die Schnittstelle erfüllen.

`websocket.Server` hat ein Feld `home home.Source`; alle Handler, die vorher `s.regaClient.X()` riefen,
rufen jetzt `s.home.X()` oder `s.homeFor(client).X()`.

**Bewertung:** Genau die Schnittstelle, die man hier will. Sie ist aus der Praxis geschnitten (was die
Handler brauchen), nicht abstrakt entworfen, und der Umbau des ReGa-Pfads ist rein mechanisch. Die
Typ-Aliase sind ein eleganter Weg, den Diff klein zu halten.

### 2.3 Weitere Schnittstellen für doppelte Funktionen

Neben `home.Source` gibt es:

| Schnittstelle | Wo | CCU | Lite |
|---|---|---|---|
| `websocket.GroupService` | `heating_groups.go:32` | HMServer über `pkg/backup` (kein Interface, `s.backup`) | `occulite.Groups` |
| `websocket.GateFunc` | `gate.go:37` | nicht gesetzt (eigenes Login) | `client.CheckSession` |
| `websocket.DeviceRPC` (bestand schon) | `websocket.go` | `ccurpc.New` (lokale Ports) | `ccurpc.NewProxy` (lite-rpc) |
| `websocket.Capabilities` | `platform.go` | alles `true` | alles `false` |
| `platformHooks` | `main.go:189` | Sysvar-Recording, Verbindungstest | Event-Stream |

Dazu kommen **optionale Schnittstellen per Type-Assertion**, also Fähigkeiten, die nur eine Plattform hat:

| Assertion | Wo | Zweck |
|---|---|---|
| `s.home.(virtualKeys)` | `virtual_keys.go:19` | `GetVirtualKeys` haben beide, aber nicht Teil von `Source` |
| `s.home.(hmipPairing)` | `websocket.go:2105` | `HmIPPairing()` nur Lite |
| `s.home.(interface{ ForSession(string) home.Source })` | `gate.go:136` | Hausmodell mit Nutzersitzung |
| `s.rpc.(sessionRPC)` | `gate.go:127` | `ccurpc.Client.WithToken` |
| `h.rpc.(userRPC)` | `occulite/home.go:94` | dasselbe nochmal im occulite-Paket |

**Bewertung:** Die expliziten Interfaces sind gut. Die Type-Assertions sind pragmatisch, aber sie sind die
Stellen, an denen die Architektur am wenigsten sichtbar ist: Niemand sieht an `home.Source`, dass ein
Hausmodell optional `ForSession` oder `GetVirtualKeys` anbieten kann, und `sessionRPC` und `userRPC` sind
dasselbe Interface in zwei Paketen. Vorschlag für später (kein Blocker):

- `GetVirtualKeys` in `home.Source` aufnehmen (beide implementieren es ohnehin).
- Die drei „mit Sitzung des Nutzers"-Varianten (`rpcFor`, `homeFor`, `groupsFor`) zu einem
  **`Actor`-Bündel** zusammenfassen, das **einmal pro Verbindung** beim Gate-Login erzeugt wird
  (`client.actor = s.actorFor(session)`), statt pro Request drei Type-Assertions und neue
  `ccurpc.Client`-Instanzen zu bauen (`WithToken` legt bei jedem Aufruf für jede Schnittstelle einen
  neuen `httpCaller` an, `proxy.go:63-69`). Das würde auch die Unterscheidung „Lesen mit Add-on-Token,
  Schreiben mit Nutzersitzung" an eine Stelle bringen; heute ist sie implizit darin, ob ein Handler
  `s.home` oder `s.homeFor(client)` ruft.

### 2.4 Was nicht hinter Schnittstellen liegt (Restrisiken)

Diese Stellen im gemeinsamen Code greifen weiter auf `s.regaClient` zu und verlassen sich darauf, dass
der Verteiler sie auf Lite nicht erreicht oder ein Capability-Flag sie abfängt:

- `websocket.go:1694`: `acknowledge = s.regaClient.AcknowledgeAlarmMessage` in `handleServiceMessages`.
  `alarm` ist auf Lite immer `false`, weil `getAlarmMessages`/`acknowledgeAlarmMessage` in
  `dispatch_ccu.go` liegen. Funktioniert, aber ein Method-Value auf einem nil-Pointer ist eine Falle,
  wenn jemand das Routing später ändert.
- `diagrams.go:257`: `s.regaClient.GetHistory` hinter `s.capabilities.History`.
- `messages_watch.go:117`: `readAlarms` mit `if s.regaClient == nil`.
- `diagrams.go:48`: `recordSysvars` hinter `!s.capabilities.Sysvars`.

Alles korrekt abgesichert, aber es sind vier verschiedene Mechanismen (Routing, Capability, nil-Check,
Build-Tag) für dieselbe Frage „gibt es hier eine ReGa?". Ein `ccuOnly` Interface (`GetHistory`,
`GetAlarmMessages`, `AcknowledgeAlarmMessage`, `GetSysvars`), das `rega.Client` erfüllt und das auf Lite
`nil` ist, wäre konsistenter. Nicht dringend.

### 2.5 Login über das Gate

`gate.go` ist klein und klar:

- Beim WebSocket-Upgrade fragt der Server occulited (`GET /api/auth/v1/state` mit dem Wert aus
  `X-Occulite-Session` als Bearer), wessen Sitzung das ist. Nur `authenticated && sid == value` zählt;
  ein API-Token am Gate (`user: "token:…"`, kein `sid`) wird abgelehnt. Das entspricht der Doku
  (system-api.md, „The gate and API tokens").
- `AddonLevel`: `configure`/`administer` → `admin`, `operate` → `user`, `read` → `guest`. Stimmt mit den
  Scopes überein, die die Doku den Stufen zuordnet.
- Jede Minute wird die Sitzung neu geprüft (`watchGate`); Logout in openccu-lite beendet die
  Verbindung. Gut: ein Fehler von occulited (nicht `ErrNoSession`) hält die Verbindung offen.
- `systemAdminError` sperrt Löschen, Ersetzen, Firmware und Heizgruppen für alle außer `administer`.
  Das deckt sich mit `lite-rpc-methods.json` (`deleteDevice`, `replaceDevice`, `installFirmware`,
  `updateFirmware` → `rpc:admin`) und `system:write` für `/groups`. Auch ohne diese Vorprüfung würde
  occulited ablehnen; die Vorprüfung liefert nur eine saubere `FORBIDDEN`-Meldung statt eines
  XML-RPC-Faults.
- Der Server bindet standardmäßig an `127.0.0.1:8088` (`config.go:150`), der Header kann also nur über
  lighttpd kommen, das Client-Kopien entfernt. Sicher.

### 2.6 Rechte und Token

Das Manifest verlangt `meta:read`, `rpc:operate`, `system:read`. Ich habe jeden Aufruf mit dem
Add-on-Token durchgesehen:

| Aufruf | Scope | nötig |
|---|---|---|
| `/api/meta/v1/snapshot`, `/events/sse` | `meta:read` | ✅ |
| `/api/rpc/v1/state`, `/events` | `rpc:read` (in `operate` enthalten) | ✅ |
| `listDevices`, `getParamsetDescription`, `getParamset` (Hausmodell) | `rpc:read` | ✅ |
| `setValue(STICKY_UNREACH, false)` in `hideStickyUnreach` (`general_settings.go:117`) | `rpc:operate` | ✅ |
| `/api/system/v1/service-messages`, `/groups` (Liste) | `system:read` | ✅ |
| `/api/meta/v1/version` | offen | ✅ |

Alle Änderungen (`PatchObject`, Nodes, `setValue` des Nutzers, `putParamset`, Install-Mode, Links,
Heizgruppen schreiben) gehen über `homeFor`/`rpcFor`/`groupsFor` mit der Nutzersitzung. Das Token ist
damit minimal. `TestLiteCallsWithTheUsersSession` sichert das ab.

### 2.7 Frontend

- `useWebsocket.tsx`: `platform` und `capabilities` kommen aus der `auth_response`, Default ist CCU
  (ältere Server ohne diese Felder laufen unverändert). Neuer `AuthState` `sessionRequired` mit eigener
  Seite (`LiteHints.tsx: SessionExpired`), die zu `/login` von openccu-lite schickt.
- `CapabilitiesContext` getrennt vom `WebSocketContext`, damit Queries nicht bei jeder
  Verbindungsänderung neu rendern. Gut. (In `useAlarmMessages` wird trotzdem `useWebSocketContext()`
  benutzt, `queries/index.ts:689`; sollte `useCapabilities()` sein wie `useSysvars`.)
- Alles, was die Plattform nicht hat, wird über `capabilities.*` ausgeblendet; die Queries dafür sind
  `enabled: false`, also wird nichts angefragt, was 404 bringen würde. `e2e/lite.spec.ts` prüft genau das.
- Theme und Sprache aus `?theme=`/`?lang=` und per `postMessage` (mit Origin-Prüfung). Sauber.

---

## 3. Korrektheit gegen occulited (verifiziert)

| Bereich | MUI | occulited-Doku | Ergebnis |
|---|---|---|---|
| Event-Stream `GET /api/rpc/v1/events` | SSE, `id:`/`event:`/`data:`, `Last-Event-ID`, 45 s Stille = tot, Kinds `event`/`state`/`newDevices`/…/`resync` | identisch (system-api.md „lite-rpc") | ✅ |
| `state`-Nachricht nutzt `datapoint` statt `key` | Fallback `key → datapoint` in `main_lite.go:136` | Doku: `state {…, datapoint, …}` | ✅ |
| `GET /state?limit=&after=` mit `event_id` | `rpc.go:31` | identisch | ✅ |
| `resync` → State neu lesen | `main_lite.go:146` | „a client reads the state again" | ✅ |
| Meta-Stream `GET /api/meta/v1/events/sse?since=` | nur `data:`, 30 s Ping, 75 s Timeout, `resync`/`import` | identisch (meta-api.md) | ✅ |
| `node.moved` mit `from`/`to`, Reorder hat `from == to` | `metastream.go:139` | ✅ | ✅ |
| `PATCH /objects/{ref}` erzeugt das Objekt, wenn es fehlt | `AcceptDevice`, `SetGroupMember` (Name mitgeben) | „Create or update" | ✅ |
| Nodes anlegen/umbenennen/löschen (`?members=detach`) | `meta.go:82-101` | ✅ | ✅ |
| Node-ID Slug (`[a-z0-9-]`, ≤ 32, Umlaute, `-2`) | `home.go:212-234` | wie `/import/ccu` | ✅ |
| Heizgruppen `GET/POST/PUT/DELETE /groups`, Member-IDs unverändert | `groups.go` | ✅ | ✅ |
| Servicemeldungen nur lesen; Sticky per `setValue false` | `messages.go:101` | „Read-only", Sticky-Reset per setValue | ✅ |
| Räume am Kanalobjekt, nicht am Gerät | `channelEnums` | wie occulites App (Maintainer-Antwort) | ✅ |
| `hmip.keyserver_mode` aus `/api/meta/v1/version` | `meta.go:106` | „Feature detection" | ✅ |
| `X-Occulite-Session` nur unter `/addons/` | `lite/lighttpd.conf`, WS-Pfad `/addons/mui/ws` | ✅ | ✅ |
| Scope-Tiers der XML-RPC-Methoden | `systemAdminError` | `lite-rpc-methods.json` | ✅ |
| Add-on-Token nie `*`/`auth:admin`/`power`/`backup`/`radio:keys` | Manifest verlangt keins davon | ✅ | ✅ |

Eine Abweichung, die kein Fehler ist: Die Fake-occulited (`fakeccu/occulited.go:303`) schickt bei
`resync` ein `id:`, die echte nicht. Der Code verträgt beides (siehe 4.6).

---

## 4. Fehler und Risiken

Sortiert nach Gewicht. Nichts davon zerstört Daten; die ersten drei sollten vor dem Release behoben werden.

### 4.1 Neuer WebSocket-Pfad auf der CCU ohne Fallback (mittel)

`useWebsocket.tsx:164`: Die App verbindet sich installiert immer mit `/addons/mui/ws`. Auf der CCU
leitet das erst die **neue** `lighttpd.conf` weiter; die alte kennt nur `/ws/mui`. Greift der
`reload` in `update_script` nicht (anderes Init-System, lighttpd hängt, Nutzer kopiert nur `dist/`),
verbindet sich die App **gar nicht** mehr, ohne Fehlermeldung, die auf die Ursache zeigt.

Vorschlag: Beim Verbindungsaufbau zuerst `/addons/mui/ws` probieren und nach dem ersten Fehlschlag
(`onerror` vor `onopen`) `/ws/mui`. Der PR nennt den CCU-Test selbst als offen; der Fallback macht den
Übergang risikolos.

### 4.2 occulited vorübergehend nicht erreichbar = „Sitzung abgelaufen" (mittel)

`websocket.go:538-544`: Liefert das Gate einen anderen Fehler als `ErrNoSession` (occulited startet
gerade neu, Timeout), wird `gateOK = false` gesetzt. `gateLogin` schickt dann `SESSION_REQUIRED`, und die
App zeigt „Sitzung abgelaufen, bei openccu-lite anmelden", obwohl die Sitzung gültig ist. Beim
WebSocket-Reconnect nach einem Update von MUI selbst (`systemctl restart addon-mui`) ist occulited zwar da,
aber ein Neustart von occulited (Update, Hot-Deploy) trifft genau diesen Fall.

Vorschlag: Den Fehler unterscheiden. Bei einem Nicht-`ErrNoSession`-Fehler eine Antwort mit einem
Retry-Code (z. B. `CCU_NOT_READY`, den die App schon kennt) und die Verbindung schließen, damit die App
mit Backoff neu verbindet, statt den Nutzer zum Login zu schicken. `watchGate` macht das bereits richtig
(„A platform that cannot tell keeps the connection").

### 4.3 Unbekannte Werte werden als Default gezeigt (klein, Anzeige; korrigiert, siehe 0.)

`home.go:430-436`: Hat das Hausmodell für einen Datenpunkt keinen Wert (nicht im Zustandsspeicher, kein
Event, BidCos ohne `getParamset`), bekommt die App `parameter.Default`, also `STATE: false`, `LEVEL: 0`.
Eine eingeschaltete BidCos-Lampe erscheint nach einem Neustart als aus, bis sie ein Event schickt. Auf
der CCU hat die ReGa den echten letzten Wert.

Das ist durch occulites Zustandsspeicher für die „üblichen" Datenpunkte abgedeckt (STATE, LEVEL,
Temperaturen, …), aber nicht für alle. Vorschlag: den Datenpunkt weglassen statt Default liefern
(prüfen, ob die Kacheln `undefined` vertragen; `Datapoints` ist `map[string]interface{}`), oder
zumindest `confirmed: false`-Einträge aus `/state` markieren.

Dazu passt `home.go:472`: `readValues` überspringt einen Kanal, sobald **irgendein** Wert bekannt ist.
Kennt der Zustandsspeicher nur `STATE` eines HmIP-Kanals, werden dessen übrige Werte nie per
`getParamset` nachgelesen (obwohl das bei HmIP kostenlos aus dem Cache kommt). Besser: `h.read[addr]`
allein entscheiden lassen.

### 4.4 `since` springt bei Typwechsel (ohne Auswirkung, siehe 0.)

`home.go:142`: `reflect.DeepEqual(previous, value)`. Werte aus `/state` und dem Stream sind JSON
(`float64`), Werte aus `getParamset` (XML-RPC) sind `int`. `1` (int) ≠ `1.0` (float64), also setzt das
erste Event nach einem `readValues` den Zeitstempel neu, obwohl sich nichts geändert hat. Betrifft
„seit wann" in der Gerätegesundheit. Lösung: vor dem Vergleich auf `float64`/`bool`/`string`
normalisieren.

### 4.5 `node.deleted` lässt Layouts der Unterknoten stehen (klein)

`metastream.go:152`: Beim Löschen eines Raums mit Unterräumen (occulited löscht den Teilbaum) wird nur
das Layout des gelöschten Pfads entfernt; die der Kinder bleiben als Leichen in `mui-tiles.json`. Da
die Schlüssel gehashte IDs sind, kann man den Präfix nicht prüfen. Entweder vor dem Löschen den letzten
Snapshot vorhalten oder die Leichen beim nächsten `viewIDs()` (das ohnehin alle gültigen IDs kennt)
aufräumen.

### 4.6 `lastID` wird bei `resync` auf `""` gesetzt (kosmetisch)

`main_lite.go:133`: `lastID = m.ID` auch für Nachrichten ohne `id:` (`resync` bei echtem occulited).
Harmlos, weil `seed()` den Wert danach ohnehin ersetzt, aber `if m.ID != ""` wäre korrekt und entspricht
`rpc.go:167`.

### 4.7 Offene Streams ohne Header-Timeout (klein)

`rpc.go:125` und `metastream.go:44`: `(&http.Client{Transport: c.HTTP.Transport}).Do(req)`.
`c.HTTP.Transport` ist `nil` (der Client in `New` setzt nur `Timeout`), also läuft das über
`http.DefaultTransport` **ohne `ResponseHeaderTimeout`**. Die Wächter-Goroutine startet erst, wenn `Do`
zurückkommt. Nimmt lighttpd die Verbindung an, aber occulited antwortet nie mit Headern, hängt der
Stream für immer (bis Shutdown), und das Hausmodell bekommt keine Events mehr, ohne Log-Zeile. Lokal
unwahrscheinlich, aber ein eigener `http.Transport{ResponseHeaderTimeout: 30 * time.Second}` kostet
nichts. Nebenbei (falsch, siehe 0.): `time.After` in der Wächter-Schleife (`rpc.go:143`, `metastream.go:62`) legt bei jedem
Event einen neuen Timer an, der erst nach 45/75 s freigegeben wird; `time.NewTimer` + `Reset` ist das
übliche Muster.

### 4.8 `useAlarmMessages` über `useWebSocketContext` (kosmetisch)

`queries/index.ts:689`: rendert bei jeder Statusänderung der Verbindung neu, was `CapabilitiesContext`
gerade vermeiden soll. `useCapabilities()` wie in `useSysvars`.

### 4.9 Toter Code

`occulite/unsupported.go:38-47`: `SetChannelTile`, `GetLayout`, `SetLayout` sind nicht mehr Teil von
`home.Source` (die Layouts liegen seit #220 in `pkg/tiles`). Können weg.

### 4.10 Nebenbei aufgefallen (nicht aus diesem PR)

`messages/de.json:1360`: „Lizenz des Add-ons (MIT)", `LICENSE`, `package.json` und das Lite-Manifest
sagen AGPL-3.0. Der Text ist älter als der PR, fällt aber auf, weil openccu-lite die Lizenz aus dem
Manifest auf der Add-on-Seite zeigt.

---

## 5. Performance

Hier liegt das meiste Potenzial. Das Lite-Hausmodell ist **zustandslos** aufgebaut: Jede Anfrage baut
alles aus den APIs neu. Auf der CCU macht die ReGa einen Skriptaufruf für „alle Kanäle eines Raums";
auf Lite werden daraus viele HTTP-Roundtrips durch lighttpd → occulited → Funkprozess.

### 5.1 Was ein Raumwechsel heute kostet

`useChannels` hat `staleTime: 0`, also fragt die App bei jedem Raumwechsel `getChannels` an.
`Home.GetChannels` (`home.go:512`) macht dann:

| Schritt | Aufrufe | Hinweis |
|---|---|---|
| `h.snapshot()` | 1× `GET /api/meta/v1/snapshot` | der **ganze** Metadaten-Store, bei 300 Objekten ~100 KB JSON |
| `h.channels()` | 1× `listDevices` **pro Schnittstelle** (BidCos-RF, HmIP-RF, VirtualDevices, BidCos-Wired) | `ccurpc.ListDevices` (`ccurpc.go:302`) cached **nicht**; hmipserver liefert bei 50 Geräten mehrere hundert KB XML |
| pro Mitglied `h.channel()` | `GetParamsetDescription(VALUES)` | gecached nach Typ/Version/Firmware → nach dem ersten Mal gratis |
| pro Mitglied `h.readValues()` | `getParamset(VALUES)` beim ersten Mal, nur HmIP/Virtual | sequenziell; 30 Kanäle × ~20 ms ≈ 0,6 s beim ersten Öffnen |
| pro Mitglied | `h.store.read` (Mutex) | vernachlässigbar |

Dasselbe Muster (`snapshot` + `channels()`) steckt in `GetAllChannels`, `SetGroupMember`,
`channelByID`, `interfaceOf` (bei Miss), `GetInbox`, `GetDeviceProblems`, `GetDeviceHealth`,
`GetVirtualKeys`, `GetRooms`, `GetTrades`, `GetDeviceNames`, `SetName`, `CreateGroup`, `RenameGroup`,
`DeleteGroup`, `GetServiceMessages`. Und `viewIDs()` (jedes `setLayout`) holt den Snapshot **zweimal**
(`GetRooms` + `GetTrades`).

Besonders teuer in Schleifen:

- **Anlernen:** `useInbox` pollt alle 3 s → `snapshot` + `listDevices` × Schnittstellen alle 3 s, und
  `useInstallMode` pollt jede Sekunde → `GET /api/meta/v1/version` jede Sekunde (`websocket.go:2105`).
- **Servicemeldungen:** `pollServiceMessages` (alle paar Sekunden, solange ein Client die Liste offen hat)
  → `/service-messages` + `snapshot`.
- **Gerätegesundheit** (alle 60 s pro Client): `snapshot` + `listDevices` × N, dazu `roomOf()` pro Gerät,
  das jedes Mal den ganzen Raum-Enum läuft und alle Objekte nach dem Präfix durchsucht
  (`messages.go:29`): O(Geräte × Objekte).
- **Heizgruppen:** `Groups.List()` macht `GET /groups` + `GET /groups/{id}` pro Gruppe, sequenziell
  (`groups.go:55`). Bei 10 Gruppen 11 Aufrufe, jeder bis 30 s Timeout bei hmipserver.

### 5.2 Vorschläge, nach Nutzen sortiert

1. **Snapshot cachen und über den Meta-Stream invalidieren.** `FollowMeta` läuft ohnehin und sieht jede
   Änderung (jede Revision). Ein `cachedSnapshot` mit `revision`, der bei jedem Meta-Event (egal welcher
   Art) verworfen wird, macht `snapshot()` zu einem Map-Lookup. Fällt der Stream aus, Fallback auf
   TTL (z. B. 5 s). Das ist der größte Hebel und ändert kein Verhalten.
2. **`listDevices` cachen und über den Event-Stream invalidieren.** `newDevices`, `deleteDevices`,
   `updateDevice`, `replaceDevice`, `readdedDevice` kommen alle über den Stream (`main_lite.go:142`);
   genau dort `deviceRPC.Forget` **plus** einen Geräte-Cache pro Schnittstelle leeren. Auch das
   `interface`-Event (Prozess down/up/restarted) sollte den Cache dieser Schnittstelle leeren. Dann
   kostet `channels()` nichts mehr. Alternativ gleich einen **Kanal-Index** im `homeState` halten
   (`map[int64]channelInfo`, `map[string]iface`), der aus diesen Events gepflegt wird; `channelByID`
   und `interfaceOf` werden dann O(1).
3. **`readValues` parallelisieren** (wie `handleDeviceHealth` mit `slots`, 4–8 gleichzeitig). HmIP
   antwortet aus dem Cache; occulited verträgt das. Oder beim Start einmal für alle HmIP-Kanäle in
   einer Hintergrund-Goroutine, 200 ms Abstand wie occulites eigener Sweep.
4. **`HmIPPairing` cachen** (ändert sich nur, wenn der Admin den Schlüsselmodus umstellt; TTL 1 min reicht).
5. **`Groups.List()` parallelisieren** oder `members` nur bei `getHeatingGroups` holen (die Liste in
   `handleHeatingGroupChange` braucht nur Namen und IDs).
6. **`roomOf` vorberechnen**: pro Aufruf einmal `map[ref]roomPath` bauen, nicht pro Gerät.
7. **`Client.token()`** liest die Token-Datei bei jedem HTTP-Aufruf (`client.go:82`). Bei hunderten
   Aufrufen beim ersten Laden ist das messbar; einmal lesen und bei `401` neu lesen, oder mit `mtime`.
8. **`WithToken`/`ForSession` pro Request** (`proxy.go:63`, `gate.go:127`) legt jedes Mal neue
   `httpCaller` an. Nicht teuer (der Transport wird geteilt, also bleibt das Connection-Pooling), aber
   einmal pro Verbindung reicht (siehe 2.3).

Mit 1 und 2 verhält sich das Lite-Hausmodell wie der ReGa-Pfad: ein Raumwechsel ist dann ein paar
Map-Lookups plus `getParamsetDescription` aus dem Cache.

### 5.3 Was schon gut ist

- `GetParamsetDescription` ist nach Typ/Version/Firmware gecached, nicht pro Adresse, und der Cache wird
  zwischen Add-on-Token und Nutzersitzung geteilt (`descriptions`-Pointer in `ccurpc.Client`). Das
  spart beim ersten Laden den Großteil der Aufrufe.
- `keepRevision` schreibt `mui-lite.json` nur, wenn die Revision eine Layout-Änderung betraf oder der
  Stream endet, nicht bei jedem Event. Und das Nachspielen nach einem Absturz ist idempotent.
- Der Event-Stream ersetzt den Callback-Server mit Resume (`Last-Event-ID`) und `resync` → re-seed. Das
  ist robuster als das XML-RPC-`init` auf der CCU.
- `typeValues` in `ccurpc` fragt die Beschreibung nur, wenn tatsächlich ein String-Wert dabei ist.

---

## 6. Installer und Packaging

- `update_script`: Die Lite-Erkennung (`LITE=` in `/VERSION` oder `/usr/bin/occulited`) steht vor dem
  CCU-Pfad und bricht mit `exit 2` ab, wenn `openccu-lite.json` oder das Binary fehlt. Richtig herum.
- `rc.d/mui-lite`: `uninstall` löscht `$DATA_DIR/*` (Layouts, Favoriten, Diagramme). Das ist beim
  Deinstallieren erwartbar; der VM-Test bestätigt, dass ein **Update** die Daten behält. Gut, dass das
  getestet ist, denn der Unterschied hängt an occulited, nicht an uns.
- `lite/lighttpd.conf`: eine Direktive pro Zeile, mit Test (`fragment_test.go`). Der Rewrite
  `[^.?]*` schließt Dateien mit Punkt aus; Routen wie `/setup/device/ABC123:1` enthalten keinen Punkt,
  aber ein Gerätename in einer Route könnte einen enthalten. Routen mit Adressen sind heute punktfrei,
  also kein akutes Problem.
- `lighttpd.conf` (CCU): `^(/ws/mui|/addons/mui/ws$)` und der Ausschluss `ws$` im SPA-Rewrite. Korrekt.
- Manifest: `start: early`, `needs: rfd, hmipserver, hs485d`, `ui.session_header`, `ui.fullscreen`.
  Alles wie in `manifest-format.md`.

---

## 7. Tests

**Abgedeckt** (Go, gegen Fake-occulited): Gate-Login, Gerätenamen, Räume/Kanäle, Schalten mit Event aus
dem Stream, Umbenennen/Gruppen/Layouts, Posteingang, Heizgruppen, Servicemeldungen/Gesundheit,
Regeln/Push, virtuelle Taster, Räume am Kanal, Limits, „Aufrufe gehen mit der Sitzung des Nutzers".
Dazu Unit-Tests für `ID`, `slug`, `typedValue`, `moveLayouts`, `FollowMeta` (Resume, Revision),
`CheckSession`, `Detect`, das lighttpd-Fragment, `Proxy`, und E2E für die App (`lite.spec.ts`,
`lite-session.spec.ts`). Plus der VM-Test gegen das echte Image.

**Lücken:**

- Die Fake-occulited (`fakeccu/occulited.go`) hat **kein** `/api/meta/v1/events/sse`; `FollowMeta` ist
  nur gegen einen `httptest`-Server in `metastream_test.go` getestet, nie im Integrationstest mit dem
  echten Ablauf „Raum in occulited verschieben → Layout folgt". Der VM-Test prüft Raum und Layout, aber
  nicht das Verschieben.
- `resync` im Event-Stream (Stream stoppen, State neu lesen) ist nicht getestet.
- Kein Test für 4.2 (Gate-Fehler ≠ keine Sitzung).
- Kein Test für `watchGate` bei **geänderter** Stufe (nur bei beendeter Sitzung).
- Nichts mit Funk, wie der PR selbst sagt.

---

## 8. Empfehlung

**Mergebar** nach den drei Punkten aus 4.1 bis 4.3 (WebSocket-Fallback, Gate-Fehler, Default-Werte),
die zusammen vielleicht 100 Zeilen sind. Die Performance-Punkte 5.2.1 und 5.2.2 (Snapshot- und
Gerätecache über die Streams invalidiert) würde ich als eigenen PR direkt danach machen; sie verändern
kein Verhalten, nur die Zahl der Aufrufe, und die Tests dafür sind da.

Was mir an dem PR gut gefällt, über die reine Korrektheit hinaus: Jede Entscheidung, die vom
CCU-Verhalten abweicht, ist im Code mit der Quelle begründet (occulited-Doku, Maintainer-Antwort), die
Fehler in openccu-lite selbst sind dokumentiert statt still umgangen, und das Rechtemodell ist enger als
nötig, nicht weiter.
