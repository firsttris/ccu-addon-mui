# PR #191: Änderungen, damit die occulited-API richtig genutzt wird

PR: https://github.com/firsttris/ccu-addon-mui/pull/191
Branch: `claude/sweet-goldberg-72zf4r-openccu-lite`
Stand: 2026-10-07, PR-Head `e89bcbf`. Zeilenangaben beziehen sich auf den PR-Branch (`go-server/`).
Ergänzt `REVIEW-PR191.md` (Korrektheit); hier geht es nur um die API-Nutzung.

## Ist-Zustand im PR

| Bereich | Heute im PR | Was die API bietet |
| --- | --- | --- |
| Werte | ✅ einmal `GET /api/rpc/v1/state?limit=5000` seeden (`pkg/occulite/rpc.go:31-55`), dann SSE `GET /api/rpc/v1/events` mit `Last-Event-ID`, Resync bei Verlust (`main_lite.go:100-135`). In-Memory-Map in `Home` (`home.go:95-124`). | genau so gedacht |
| Metadaten (Namen, Räume, Gewerke) | ⚠️ Der Change-Stream wird bereits gefolgt (`metastream.go`, `FollowMeta` ab `:97`), aber nur, um die eigenen Layouts bei `node.moved`/`node.deleted` nachzuziehen. `GET /api/meta/v1/snapshot` wird weiterhin bei **jedem** Lese-/Schreibaufruf geholt (`home.go:75-79`; Aufrufer `:162, :170, :210, :234, :266, :462`) | Snapshot einmal + Stream auf den lokalen Snapshot anwenden (`meta-api.md` Z. 106-169) |
| Geräteliste | ❌ `ListDevices` auf jedem Interface bei jedem `channels()`-Aufruf (`home.go:313-336`), zusätzlich in `interfaceOf` bei Miss (`:343`) und `channelByID` (`:353`) | Device-Events kommen schon über den Stream (`main_lite.go:118`), `?devices=1` liefert `newDevices` mit kompletten Descriptions |
| Werte-Seed pro Kanal | ⚠️ `readValues` ruft `GetParamset(VALUES)` seriell pro nicht-BidCos-Kanal ohne Werte (`home.go:440-458`); BidCos wird bereits übersprungen ✅ | State-Store liefert die „chosen set“-Werte bereits; Rest gebündelt via `system.multicall` |
| Heizgruppen | ⚠️ `GET /groups` + `GET /groups/{id}` pro Gruppe, seriell (`groups.go:55-80`) | API-bedingt (Liste enthält keine Mitglieder); nur parallelisierbar |
| Auth-Token | ℹ️ Token-Datei pro Request von Platte (`client.go:57-66`) | bewusst so, gering |

## Änderungen

### 1. Meta-Snapshot cachen und per Change-Stream aktuell halten (größter Hebel)

- Der Stream läuft schon: `FollowMeta` (`metastream.go:97`) mit Reconnect/Backoff und
  `since`. Es fehlt nur, dass `onMetaEvent` (`:125`) den **lokalen Snapshot** pflegt
  statt bei `node.moved` selbst wieder `h.snapshot()` zu rufen (`:131`).
- `Home` bekommt `snapshot Snapshot` + `revision` unter `h.mu`. Beim Start einmal
  `GET /api/meta/v1/snapshot` laden, `revision` merken, `FollowMeta` mit dieser
  Revision starten statt mit 0.
- In `onMetaEvent`: `object.updated` → Objekt im Snapshot ersetzen; `node.*` → Enum-Baum
  anpassen; `import` oder Lücke (Server kennt `since` nicht mehr, Stream antwortet mit
  Fehler) → Snapshot komplett neu laden. Die bestehende Layout-Logik (`moveLayouts`)
  liest dann aus dem lokalen Snapshot.
- `h.snapshot()` gibt den lokalen Snapshot zurück (Kopie oder read-locked).
- Alle Leser (`GetRooms`, `GetTrades`, `GetChannels`, `GetAllChannels`,
  `GetDeviceNames`) lesen den lokalen Snapshot.
- Schreiber (`SetName`, `SetGroupMember`, `CreateGroup`, `changeNode`) schreiben über
  die API wie bisher; der eigene Change kommt über den Stream zurück. Optional: direkt
  nach dem PATCH die Antwort in den lokalen Snapshot übernehmen, damit die nächste
  Query ohne Race aktuell ist.
- Damit entfallen alle Snapshot-Fetches pro Request. Räume/Kanäle werden In-Memory-Filter.

### 2. Geräteliste in `Home` cachen und über Device-Events invalidieren

- `channels()` liefert aus `h.devices map[iface][]DeviceDescription`, gefüllt beim
  Start pro Interface.
- `main_lite.go:118` reicht `newDevices`/`deleteDevices`/`updateDevice`/
  `replaceDevice`/`readdedDevice` heute nur an `deviceRPC.Forget`; zusätzlich
  `homeModel.DevicesChanged(iface, addresses)` aufrufen, das die Liste des Interfaces
  neu lädt (oder bei `?devices=1` die mitgelieferten Descriptions direkt übernimmt).
- `interfaceOf` und `channelByID` arbeiten dann auf der Map, kein `ListDevices` mehr.
- `h.interfaces` nicht mehr in `channels()` neu zuweisen, sondern beim Laden der
  Geräteliste pflegen.

### 3. `GetChannels(room)` als Filter statt Vollaufbau

- Nach 1 und 2 sind Snapshot und Geräteliste lokal. `GetChannels(objectID)`
  (`home.go:494-544`) soll zuerst die Refs der Gruppe (eigene + geerbte Enums) sammeln
  und nur für diese `channel()` bauen, statt alle Kanäle zu bauen und dann zu filtern.
- Gleiches für Favoriten.

### 4. Werte-Seed bündeln und drosseln

- `readValues` (`home.go:452-471`) beim Start (nicht beim ersten Anzeigen) für alle
  Kanäle ausführen, die der State-Store nicht abdeckt:
  - HmIP: über `system.multicall` am lite-rpc-Proxy gebündelt.
  - BidCos-RF: explizit ausnehmen oder ≥200 ms Abstand (Funkzeit; wie occulites „sweep“).
- Fallback auf den Paramset-Default (`home.go:411-416`) für BidCos-Datenpunkte außerhalb
  des „chosen set“ kennzeichnen (z. B. `unknown: true` im Channel), damit die App keinen
  falschen Wert als echt anzeigt.

### 5. Event-Stream: Filter und WebSocket nutzen

- lite-rpc bietet Filter nach Interface/Adresse/Key und `GET /api/rpc/v1/events/ws`.
  Für uns reicht der ungefilterte Stream (wir brauchen alles für den Cache), aber bei
  Resync sollte `state` nur für die Keys gelesen werden, die wir tatsächlich zeichnen,
  statt `limit=5000` komplett zu paginieren.
- Replay-Puffer (5 min / 5000 Events) wird bereits über `Last-Event-ID` genutzt ✅.

### 6. Heizgruppen: Detail-Abfragen parallelisieren

- `Groups.List` (`groups.go:40-50`, `:244`): die `GET /groups/{id}` mit einem
  `errgroup` und Limit (z. B. 4) parallel ausführen. Mitglieder/`device_name` werden nur
  beim Öffnen der Gruppen-Seite gebraucht, nicht bei der Liste; ggf. zwei Methoden
  (`List` ohne, `Get` mit Details).
- `handleHeatingGroupChange` soll nicht vor jedem Save/Delete erneut `listGroups`
  aufrufen, sondern das einzelne `GET /groups/{id}`.

### 7. Kleinere Punkte

- Token-Datei (`client.go:57-66`) einmal lesen und bei 401 neu einlesen, statt pro
  Request. Gering, aber kostenlos.
- Snapshot-Fetch bei `changeNode`/`CreateGroup` nur noch für die Validierung des Pfads
  aus dem lokalen Snapshot (siehe 1).

## Reihenfolge

1. Punkt 1 (Snapshot-Cache + SSE) und Punkt 2 (Geräteliste) zusammen, da `channels()`
   und alle Leser davon abhängen.
2. Punkt 3 (Filter), fällt nach 1+2 fast von selbst ab.
3. Punkt 4 (Seed), Punkt 6 (Heizgruppen).
4. Punkt 5 und 7.

Nach 1-3 ist der lite-Pfad beim Lesen vollständig In-Memory, so wie es die API
vorsieht, und schneller als der CCU3-Pfad. Die Konzepte lassen sich danach in
`pkg/home` hochziehen und für die CCU3 übernehmen (siehe `CCU3-IDEEN-AUS-OCCULITED.md`).
