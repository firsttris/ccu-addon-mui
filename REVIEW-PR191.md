# Code-Review PR #191 – openccu-lite-Integration

PR: https://github.com/firsttris/ccu-addon-mui/pull/191
Branch: `claude/sweet-goldberg-72zf4r-openccu-lite`
Review-Stand: 2026-10-07, zwei Durchgänge (Standard + high effort, alle Findings).

**Update:** Der PR wurde nach dem Review überarbeitet (Head `e89bcbf`). Jeder Punkt trägt
jetzt eine Stand-Zeile. Offen sind nur noch die Performance-Punkte E1 bis E3.

Die Grundstruktur (eigenes `occulite`-Paket, Plattform-Gate, Capabilities im Frontend)
ist sauber. Die folgenden Punkte sind nach Schwere sortiert. Jeder Punkt nennt
Datei:Zeile, das Problem, ein konkretes Fehlerszenario und einen Fix-Vorschlag.

---

## A. Blockierend (vor dem Merge fixen)

### A1. `saveDiagram` panict auf openccu-lite
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (startSeries nutzt s.home, History hinter capabilities.History)
- **Datei:** `go-server/pkg/websocket/diagrams.go:221-233`
- **Problem:** `startSeries` ruft `s.regaClient.GetAllChannels()` und `GetHistory` auf
  dem `*rega.Client` auf. Im lite-Build ist der nil. Der Handler wird auf beiden
  Plattformen dispatcht.
- **Szenario:** Lite-User speichert ein Diagramm mit neuer Kanal-Serie → `startSeries`
  → nil-Deref in `executeWithin` → Panic wird vom Recover gefangen → keine
  `saveDiagram_response` → App zeigt Timeout/Fehler, obwohl gespeichert wurde.
- **Fix:** `s.home.GetAllChannels()` verwenden; den History-Import (`GetHistory` ist
  CCU-only) hinter einen nil-/Capability-Guard legen.

### A2. Raum/Gewerk-Zuordnung ignoriert vom Gerät geerbte Enums
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (Commit „Räume nur am Kanal“: channelEnums liest nur die Kanal-Enums)
- **Datei:** `go-server/pkg/occulite/home.go:255` (`SetGroupMember`) und `:409` (`channel()`)
- **Problem:** `channel()` zeigt einen Kanal in den Enums seines Geräts, wenn das
  Kanal-Objekt keine eigenen hat. `SetGroupMember` liest aber nur `object.Enums`
  (leer) und patcht daraus.
- **Szenario:** Kanal :1 erbt Raum „Küche“ vom Gerät. User entfernt :1 aus Küche →
  Patch `enums: []` → Fallback greift wieder → Kanal bleibt in Küche, Handler meldet
  `SetOK`. Umgekehrt: Hinzufügen zu Raum B patcht `enums: [B]` → Kanal verschwindet
  ungefragt aus Küche.
- **Fix:** Patch von der effektiven (geerbten) Enum-Liste ausgehen lassen, oder den
  Fallback in `channel()` entfernen.

### A3. Service-Meldungen lassen sich nicht quittieren
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt, bewusst anders: nicht-sticky Meldungen antworten NOT_SUPPORTED (occulited-Meldungen sind read-only), App bietet kein Quittieren an
- **Datei:** `go-server/pkg/occulite/messages.go:417` (`AcknowledgeServiceMessage`)
- **Problem:** Liefert für alles außer `STICKY_*` ein `SetNotFound`.
- **Szenario:** Lite-Admin quittiert LOW_BAT / UNREACH / CONFIG_PENDING → App zeigt
  NOT_FOUND für eine Meldung, die sie gerade anzeigt. Auf der CCU funktioniert es.
- **Fix:** Nicht-sticky Meldungen ebenfalls quittieren (oder, falls lite das nicht
  kann, im Frontend den Button per Capability ausblenden und einen passenden
  Fehlercode liefern).

### A4. Sprachprofile werden in `/etc/config/userprofiles` geschrieben
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (language.go nutzt DataDir auf lite)
- **Datei:** `go-server/pkg/websocket/language.go:23`, `go-server/cmd/.../main_lite.go`
- **Problem:** User-Sprachdateien liegen weiter unter `cfg.ConfigDir`. Auf lite ist das
  für das Add-on vermutlich nicht schreibbar; `main_lite.go` setzt das Verzeichnis nie
  auf `DataDir` um.
- **Szenario:** User wählt Deutsch → `MkdirAll`/`WriteFile` → permission denied →
  Toast „setUserLanguage failed“.
- **Fix:** Profilverzeichnis im lite-Build auf `cfg.DataDir` zeigen lassen.

### A5. Abgelaufene lite-Session führt in ein totes CCU-Login-Formular
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (eigener Code SESSION_REQUIRED, authRequired false)
- **Datei:** `go-server/pkg/websocket/gate.go:31`, `src/hooks/useWebsocket.tsx:365`
- **Problem:** Findet das lite-Gate keine Session, antwortet der Server mit
  `LOGIN_REQUIRED` + `authRequired:true`. Die App rendert daraufhin ihr eigenes
  Username/Passwort-Formular, das auf lite nie erfolgreich sein kann (Login geht
  wieder ans Gate).
- **Szenario:** occulited-Session läuft ab, WebSocket reconnectet → Gate schlägt fehl
  → App zeigt Login → jeder Submit: „no session of the system“. User hängt fest.
- **Fix:** Eigenen Code (z. B. `SESSION_REQUIRED`) liefern und im Frontend auf die
  openccu-lite-Login-Seite umleiten bzw. die Seite neu laden.

---

## B. Sicherheit / Auth

### B1. Session wird nur beim WebSocket-Upgrade geprüft
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (gate.go prüft die Session periodisch, gateRecheck-Ticker)
- **Datei:** `go-server/pkg/websocket/websocket.go:527`
- **Problem:** Logout oder Widerruf der Session in openccu-lite wirkt nicht auf
  bereits offene Sockets; `client.authenticated` und `alwaysElevated` bleiben gesetzt.
- **Szenario:** Admin öffnet MUI, loggt sich in einem anderen Tab aus openccu-lite aus
  → MUI-Tab kann weiter pairen, umbenennen, setValue etc., bis die Verbindung abbricht.
- **Fix:** Session periodisch (z. B. alle 60 s) oder vor privilegierten Aktionen erneut
  gegen occulited validieren; bei Fehler Socket schließen.

### B2. `elevate` liefert mit Plattform-Gate für jeden Client Erfolg
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (handleElevate prüft gateSession.Level == LevelAdmin)
- **Datei:** `go-server/pkg/websocket/websocket.go:1122` (`handleElevate`)
- **Problem:** Bei `s.auth == nil` (lite) bekommt auch ein „operate“-User
  `elevated:true`, entgegen der Regel in `gate.go` („only administrators are elevated“).
- **Szenario:** Level-Checks blockieren zwar noch Admin-Aktionen, aber Frontend-State
  (`elevated`, `elevatedUntil`) und Logs werden inkonsistent; jeder künftige Handler,
  der nur `elevated()` prüft, wäre offen.
- **Fix:** `handleElevate` auf lite nur für Admin-Level erfolgreich antworten lassen,
  sonst Fehler.

---

## C. Frontend

### C1. `useSysvars` / `usePrograms` nicht per Capability gegated
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (useSysvars/usePrograms mit enabled aus useCapabilities)
- **Datei:** `src/queries/index.ts:252`; Verwender: Favorites, FavoriteEditor,
  DiagramEditor, DeviceSysvars
- **Problem:** Auf lite werden `getSysvars`/`getPrograms` weiter gesendet; Server
  antwortet „unknown message type“, react-query retried, Picker rendern leer.
- **Fix:** Queries mit `enabled: capabilities.sysvars` (bzw. `programs`) versehen und
  die Picker/Abschnitte in den Editoren per Capability ausblenden.

---

## D. Korrektheit / Randfälle

### D1. Deduplizierte Raum-/Gewerk-ID kann 32 Zeichen überschreiten
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (Suffix wird innerhalb der 32 Zeichen angehängt)
- **Datei:** `go-server/pkg/occulite/home.go:209`
- **Problem:** `slug(name)` kürzt auf 32 Zeichen, danach wird `-2` angehängt → 34 Zeichen.
- **Szenario:** Zweiter Raum mit langem Namen → occulited lehnt die Node-ID ab
  (`id ≤ 32`, `[a-z0-9-]`) → `CreateGroup` schlägt fehl, obwohl der Name legal ist.
- **Fix:** Erst Suffix anhängen, dann auf 32 kürzen.

---

## E. Performance

### E1. Snapshot und `listDevices` werden pro Request neu geholt (kein Cache)
- **Stand (PR-Head e89bcbf, 2026-10-07):** ⬜ offen; Infrastruktur dafür ist jetzt da: FollowMeta/MetaEvents folgen dem Change-Stream bereits (metastream.go), aber nur für die Layouts. snapshot() holt weiterhin pro Aufruf, channels() listet weiterhin pro Aufruf. Siehe PR191-API-BESSER-NUTZEN.md Punkt 1+2
- **Datei:** `go-server/pkg/occulite/home.go:75-79` (Snapshot), `:313-336` (`channels()`),
  `:343` (`interfaceOf`), `:353` (`channelByID`), `main_lite.go:118-121`
- **Problem:** Jeder Aufruf von GetRooms/GetTrades/GetChannels/GetAllChannels/SetName/
  SetGroupMember holt den kompletten `GET /api/meta/v1/snapshot` neu und ruft
  `ListDevices` auf jedem Interface (`ccurpc.ListDevices` cached nicht, es füllt nur den
  Description-Cache). `channelByID` (SetGroupMember) und `interfaceOf` bei Cache-Miss
  listen ebenfalls alle Geräte. Die Geräte-Events (`newDevices`/`deleteDevices`/
  `updateDevice`) aus dem SSE-Stream erreichen nur `deviceRPC.Forget`, nicht `Home`.
  `/api/meta/v1/events/sse?since=<revision>` wird gar nicht abonniert.
- **Hinweis:** Die ursprüngliche Formulierung (`defaultName` ruft `h.channels()` auf)
  war falsch; `defaultName` ist ein reiner Map-Lookup im Snapshot.
- **Fix:** Snapshot einmal laden und per `/api/meta/v1/events/sse?since=` aktuell
  halten; Device-Liste in `Home` cachen und über die Device-Events invalidieren.
  Dann sind Raum-/Kanal-Anfragen reine In-Memory-Filter.

### E2. `GetChannels(objectID)` baut alle Kanäle des Homes und filtert erst danach
- **Stand (PR-Head e89bcbf, 2026-10-07):** ⬜ offen (GetChannels baut weiter alle Kanäle und filtert dann)
- **Datei:** `go-server/pkg/occulite/home.go:473`
- **Problem:** Pro Raum/Gewerk/Favoriten-Request: voller Snapshot-HTTP-Call + Pass über
  alle Kanäle aller Interfaces inkl. Value- und Store-Reads. Auf der CCU besucht das
  ReGa-Script nur die Mitglieder.
- **Fix:** `h.channels()` vor dem `channel()`-Aufruf anhand der Refs der Gruppe filtern.

### E3. N+1 bei Heizgruppen
- **Stand (PR-Head e89bcbf, 2026-10-07):** ⬜ offen (Groups.List weiterhin seriell N+1; API-bedingt, nur parallelisieren)
- **Datei:** `go-server/pkg/occulite/groups.go:244` (`Groups.List`)
- **Problem:** Pro Gruppe ein extra `GET /api/system/v1/groups/<id>`, obwohl die
  Listenantwort die kopierten Felder schon enthält. `handleHeatingGroupChange` ruft
  `listGroups` zusätzlich vor jedem Save/Delete auf.
- **Fix:** Felder direkt aus der Listenantwort übernehmen.

---

## F. Kleinigkeiten / Aufräumen

### F1. Toter `default`-Zweig in `virtual_keys.go`
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (kein regaClient-Fallback mehr in virtual_keys.go)
- **Datei:** `go-server/pkg/websocket/virtual_keys.go:22-26`
- **Problem:** `*rega.Client` implementiert `GetVirtualKeys() ([]home.VirtualKey, error)`
  bereits (`rega.VirtualKey` ist ein Alias), also gewinnt immer der erste Case; der
  `regaClient`-Fallback läuft nur bei `home == nil`.
- **Fix:** Optional-Interface-Check auf `s.home` (oder `GetVirtualKeys` in `home.Source`
  aufnehmen) und den `regaClient`-Zweig entfernen.

### F2. Falscher Dateiverweis im Kommentar
- **Stand (PR-Head e89bcbf, 2026-10-07):** ✅ erledigt (Kommentar zeigt auf src/hooks/capabilities.ts)
- **Datei:** `go-server/pkg/websocket/platform.go:11`
- **Problem:** Kommentar verweist auf `src/hooks/useCapabilities.ts`; die Datei heißt
  `src/hooks/capabilities.ts`.

---

## Vorgeschlagene Reihenfolge für die Umsetzung
1. A1, A2, A3, A4, A5 (Funktionsfehler auf lite)
2. B1, B2 (Auth)
3. C1, D1
4. E1, E2, E3 (Performance; E1 zuerst, ist der größte Hebel; E3 ist API-bedingt, nur parallelisieren)
5. F1, F2

Nach jedem Block: `go build ./...` + `go test ./...` im `go-server`, Frontend-Lint/Typecheck.
