# Clean-Code-Befunde

Stand: 10. Oktober 2026, `main` auf Commit `a735ed3`. Die Aufteilung von
`websocket.go` nach Domänen (PR #227) ist schon enthalten.

Grundlage sind zwei Durchsichten, eine fürs Frontend (`src/`, ohne das erzeugte `src/types/protocol.ts`)
und eine für den Go-Server (`go-server/`). Dazu kamen diese Werkzeuge:

- `staticcheck`, einmal ohne und einmal mit `-tags lite`
- `deadcode`
- `tsc --noUnusedLocals --noUnusedParameters`

Die mit ✔ markierten Befunde habe ich selbst nachgeprüft.

Insgesamt ist der Code sauber. Es gibt keine TODO- oder FIXME-Kommentare und keinen auskommentierten
Code. Typ-Schlupflöcher sind selten: im Frontend ein einziges `any` und kein `@ts-ignore`. Die
Baustellen sind vor allem Wiederholungen, zu große Dateien und fehlende Werkzeuge, die einen
einheitlichen Stil durchsetzen.

Größe: **S** klein (unter einer Stunde), **M** mittel, **L** groß.

## Übersicht

| # | Befund | Bereich | Größe |
|---|---|---|---|
| 1 | Kein Linter oder Formatter erzwingt den Stil (erledigt: Biome, staticcheck) | beide | M |
| 2 | Code, den nur die CCU braucht, ohne Build-Tag (erledigt) | Go | S |
| 3 | Uneinheitliche Fehlercodes, `requestId` geht verloren (erledigt) | Go | S |
| 4 | Kopierte Helfer und Reste im Frontend (erledigt) | Frontend | S–M |
| 5 | Veraltete Go-Idiome, Logger ohne `Errorf` (erledigt) | Go | S |
| 6 | Gleicher Anfang in jedem Handler, Antwort-Structs (erledigt) | Go | M |
| 7 | Fehlerbehandlung bei Änderungen mehrfach kopiert (erledigt) | Go | S |
| 8 | Selbstgebaute TTL-Caches neben `cachedList[T]` | Go | M |
| 9 | Globale Variablen, Abhängigkeit von der Aufrufreihenfolge | Go | M |
| 10 | Handler gehen an `home.Source` vorbei direkt zur ReGa | Go | M |
| 11 | Zu große Frontend-Dateien (bis auf `DeviceSettings.tsx` erledigt) | Frontend | L |
| 12 | Wiederholte UI-Bausteine und Zahlenformatierung | Frontend | M |
| 13 | Zu lange Go-Funktionen, die nur aus einem großen `switch` bestehen (größtenteils erledigt) | Go | L |
| 14 | `integration_test.go` wiederholt dieselben Abläufe | Go-Tests | M |

## Klein, mit großer Wirkung

### 1. Kein Linter oder Formatter erzwingt den Stil

**Frontend: erledigt mit Biome.** `biome.jsonc` legt Formatierung und Lint-Regeln fest (das empfohlene
Preset), `npm run lint` prüft sie, und der Build-Workflow führt `biome ci --error-on-warnings` aus: Auch
eine Warnung lässt ihn scheitern, damit sich keine ansammeln. Der Code ist einmal durchformatiert, und
Biome meldet nichts mehr.

Wo der Code richtig ist und die Regel trotzdem anschlägt, steht ein `biome-ignore` mit dem Grund. Das
sind 100 Stellen, vor allem:

| Regel | Stellen | Warum Absicht |
|---|---|---|
| `suspicious/noArrayIndexKey` | 36 | feste Listen, Optionen, deren Wert der Index ist, und bearbeitbare Listen ohne IDs mit kontrollierten Zeilen |
| `a11y/useSemanticElements` | 28 | Segment-Schalter mit `role="radio"`, `role="group"` statt `fieldset`, selbst gezeichnete Anzeigen, ausdrückliche Listen-Rollen für Safari |
| `correctness/useExhaustiveDependencies` | 18 | Abhängigkeiten, die nur auslösen, und Aufräumen nur beim Unmount |
| `style/noNonNullAssertion` | 6 | Refs in Zeiger-Handlern, Werte, die die Bedingung davor garantiert |

In Tests ist `noNonNullAssertion` aus.

Behoben statt ausgenommen:

- 23 Schaltflächen bekamen `type="button"`.
- 12 `!` im App-Code sind durch Eingrenzen des Typs ersetzt.
- `aria-label` stand auf Elementen ohne Rolle; diese Elemente haben jetzt eine Rolle.
- Zier-SVGs sind `aria-hidden`.
- Der Drehregler des Thermostats lässt sich mit der Tastatur bedienen.

Noch offen: Die Importe sind nicht sortiert. Biomes `organizeImports` ist abgeschaltet, weil es fast
jede Datei geändert hätte.

**Go: erledigt.** Die CI führt `staticcheck` (fest auf v0.8.1) für beide Builds aus, mit und ohne
`-tags lite`. Dafür ist der Push-Code auf die Byte-Kodierungen von `crypto/ecdsa` aus Go 1.25 umgestellt
(SA1019). Ein Test sichert ab, dass ein gespeicherter Schlüssel denselben öffentlichen Schlüssel behält.
Der Panic-Test löst sein `panic` jetzt ausdrücklich aus statt über eine nil-Map (SA5000).
`golangci-lint` lässt sich derzeit nicht nutzen: Die verfügbare Version ist mit Go 1.25 gebaut, das
Projekt verlangt Go 1.27.1.



### 2. Code, den nur die CCU braucht, steht in Dateien ohne Build-Tag: erledigt

`staticcheck -tags lite ./...` meldete Code als ungenutzt, den nur die CCU braucht. Er steht jetzt hinter
`//go:build !lite`, und `staticcheck` meldet in beiden Builds nichts mehr:

| Was | Wohin |
|---|---|
| `logic.go`, `backup.go`, `clock.go` (mit Test) | die Dateien tragen das Tag |
| die Systemeinstellungen aus `system.go` (Ort, Zeit, Neustart, ReGa-Version) | `system_settings.go` (mit Test) |
| `handleSetChannelOption` und `readOnlyChannels.invalidate` | `channel_options_ccu.go` |
| die Server-Felder `logs`, `lastSysvars`, `sysvarsMu`, `autoLoginUsers` | `ccuState` in `state_ccu.go`; im Lite-Build eine leere Struktur (`state_lite.go`) |

Die Binaries sind dadurch nicht kleiner geworden, weder das Lite-Binary noch das für die CCU (gemessen
für arm64). Der Linker hatte das Ungenutzte schon vorher entfernt. Der Gewinn ist die Übersicht: Was nur
die CCU kann, steht jetzt sichtbar beisammen.

Bewusst gemischt bleiben `handleObjects` (Systemvariablen) und `handleServiceMessages` (Alarme
bestätigen). Ihre CCU-Fälle teilen sich Parsing, Audit und Rechteprüfung mit den gemeinsamen Fällen und
sind nur über `dispatch_ccu.go` erreichbar. Eine Aufteilung würde diesen Teil verdoppeln.

### 3. Uneinheitliche Fehlercodes, `requestId` geht verloren: erledigt

- Eine Nachricht, die sich nicht lesen lässt, beantwortet der Server jetzt überall mit `INVALID_REQUEST`.
  Das gilt auch für kaputtes JSON und eine kaputte Anmeldung. `INVALID_MESSAGE` gibt es nicht mehr, auch
  nicht in der App.
- `setDatapoint` und `subscribe` antworten darauf mit ihrer `requestId`, wenn die Nachricht eine hat. Die
  wartende Anfrage scheitert dann sofort statt nach dem Timeout.
- `sendError` und `sendErrorCode` sind entfallen. Fehler gehen nur noch über `sendRequestError`.
- Die `requestId` aus `dispatch` an alle Handler weiterzureichen, gehört zu #6, einheitliche Signaturen.

### 4. Kopierte Helfer und Reste im Frontend: erledigt

- **Gemeinsame Helfer statt Kopien**, als reine Funktionen in `lib/`:
  - `lib/address.ts`: `deviceAddressOf`, `channelOf`, `channelNumberOf`. Sie ersetzen sieben lokale
    Kopien (`deviceOf`, `channelIndex` …) und die von Hand geschriebenen `address.split(':')`.
  - `lib/format.ts`: `pad2`, `dayName`, `formatTemperature`.
  - `lib/validation.ts`: `IPV4`.
  - `inlineSelectClass` in `components/ui/select.tsx`.
- **Doppelte Namen aufgelöst:**
  - Die Temperaturgrenzen gibt es nur noch als `MIN_TEMP`/`MAX_TEMP`.
  - `isPercentUnit` (`controls/generic/parameters.ts`) ersetzt zwei gleiche `isPercent`. Das breitere in
    `settingKinds` heißt jetzt `isPercentSetting`.
  - Das lokale `isLight` im Dashboard heißt jetzt `countsAsLight`.
- **Reste:**
  - `getPercentageGradient` und `getPercentageColor` sind gelöscht, ebenso ein ungenutztes `pad2` in
    `programModel` und der Re-Export von `DEVICE_TABS`.
  - `useLocalStorage` schreibt nichts mehr per `console.log`.
  - `DeviceSettings` nutzt `errorText`.
  - `utils/` ist in `lib/` aufgegangen, `colors.ts` hat englische Kommentare.
  - Hooks ohne JSX sind `.ts`-Dateien.
  - 32 Exporte, die nur in ihrer eigenen Datei gebraucht werden, sind nicht mehr exportiert. Ermittelt
    mit `knip`. Die Bausteine in `components/ui` bleiben als Bibliothek exportiert.

### 5. Veraltete Go-Idiome, Logger ohne `Errorf`: erledigt

- **`any` statt `interface{}`** im ganzen Server (`gofmt -r 'interface{} -> any'`).
- **`slices.Contains`** statt der eigenen Helfer `contains`, `containsString` und `containsInt`.
- **Sortieren mit `slices`.** `slices.Sort`, `slices.SortFunc` und `slices.SortStableFunc` mit
  `cmp.Compare` bzw. `time.Time.Compare` ersetzen `sort.*`. Die Schlüssel einer Map, von Hand
  gesammelt und sortiert, sind jetzt `slices.Sorted(maps.Keys(m))`.
  - Ausnahme ist `ccurpc.InterfaceNames`: Bei einer leeren Map liefert `slices.Sorted` `nil`, und die
    Liste geht als JSON an die App, wo aus `[]` sonst `null` würde.
- **Logger.**
  - `Infof` und `Errorf` ersetzen die 31 `logger.X(fmt.Sprintf(…))`. Die Ausgabe bleibt dieselbe.
  - `LogStartupInfo` steht als `logStartup` in `main.go`. `logger` braucht `config` nicht mehr.
- **Bewusst nicht:** Ein Level-Präfix für `Info` und `Error` hätte jede Zeile der Logdatei verändert,
  die Nutzer kennen. Die Fehlerzeilen sind schon an ihren Emojis und Texten zu erkennen.

## Mittel: Wiederholungen im Go-Server

### 6. Gleicher Anfang in jedem Handler, Antwort-Structs: erledigt, bis auf zwei bewusste Ausnahmen

- **Nachricht lesen.** `decode(client, message, &msg)` ersetzt in 43 Handlern die vier Zeilen aus
  `json.Unmarshal`, Fehlerantwort und `return`. Eine Nachricht, die sich nicht lesen lässt, kommt überall
  mit `INVALID_REQUEST` und ihrer `requestId` zurück. `decode` liest die `requestId` selbst aus der
  Nachricht.
- **Bewusst nicht gemacht:**
  - **Eine Signatur für alle Handler:** Sie hätte 57 direkte Aufrufe in den Tests geändert. Der
    `switch` in `dispatch` ist so lesbar.
  - **`responseHeader` einbetten:** Die Struct-Literale würden länger, nicht kürzer, weil
    `responseHeader: responseHeader{…}` mehr Text ist als `Type:` und `RequestID:`.

### 7. Fehlerbehandlung bei Änderungen mehrfach kopiert: erledigt

- **Tabelle.** `errorcodes.go` enthält eine Tabelle `serviceErrorCodes` (Sentinel-Fehler → Code) und
  `codeOf(err, own...)`. Damit bekommt derselbe Fehler überall denselben Code.
- **`failChange`** ersetzt `diagramFailed`, `ruleFailed`, `groupChangeFailed` und `securityFailed`.
- **`mayConfigure(client, requestID, entry)`** ersetzt in 15 Handlern die Folge `configureError` →
  `recordAudit` → `sendRequestError`.
- **Bleibt, wie es ist:** Die Prüfungen auf ReGa-Fehlertexte („invalid …“) bilden je nach Handler bewusst
  auf `INVALID_VALUE` oder `INVALID_REQUEST` ab.

### 8. Selbstgebaute TTL-Caches neben `cachedList[T]`

`messages_watch.go:56` bietet mit `cachedList[T]` schon einen generischen Cache. Viermal ist trotzdem
von Hand derselbe Cache aus Mutex, Wert und Zeitstempel gebaut:

- `health.go:28`
- `device_firmware.go:38`
- `channel_options.go:19`
- `selfupdate.go:114`

**Vorschlag:** `cachedList[T]` zu einem `cached[T]` verallgemeinern und überall nutzen.

### 9. Globale Variablen, Abhängigkeit von der Aufrufreihenfolge

- **Globale Variablen für die Produktion.** `SetGroupsFile` (`heating_groups.go:23`) und
  `SetClockFiles` (`clock.go:24`) sind als „für Tests“ dokumentiert, `main_ccu.go:77–78` ruft sie aber
  auf.
- **Getrennte Deklaration und Zuweisung.** `timeConfFile` wird in `system.go:123` deklariert und in
  `clock.go:26` gesetzt.
- **Globaler Cache.** Der Cache `lowBatLimits` (`health.go:38`) ist global und damit für alle
  `Server`-Instanzen derselbe.
- **Aufrufreihenfolge.**
  - `NewServer` setzt `regaClient` zweimal (`websocket.go`).
  - `SetRega` überschreibt `s.home` (`routes_ccu.go:49`), deshalb muss `SetHome` danach kommen.
  - `main_lite.go:57` setzt voraus, dass `SetTiles` schon gelaufen ist (`main.go:64`).

**Vorschlag:** Die Pfade als Felder in `Server` oder in die Konfiguration aufnehmen, den Cache in
`Server` verlegen. Die Verdrahtung in `main` sollte nicht von der Reihenfolge abhängen.

### 10. Handler gehen an `home.Source` vorbei direkt zur ReGa

`s.regaClient` kommt in 16 Dateien von `pkg/websocket` vor, auch in Dateien, die beide Builds nutzen:
`heating_groups.go:260` und `:285` sowie `diagrams.go:60` und `:257`. Auf openccu-lite ist
`regaClient` `nil`. Das funktioniert nur, weil die Aufrufe dort nie erreicht werden.

**Vorschlag:** Diese Aufrufe hinter Schnittstellen legen, so wie es `GroupService` schon tut. Dann
kennen gemeinsam genutzte Dateien `*rega.Client` gar nicht.

## Groß: lange Dateien und Funktionen

### 11. Zu große Frontend-Dateien: bis auf `DeviceSettings.tsx` erledigt

Der Code ist jeweils nur verschoben. Ein Zeilenvergleich vor und nach dem Umzug zeigt dieselben Zeilen.

| Datei | Vorher | Nachher |
|---|---|---|
| `views/setup/Security.tsx` | 782 | 163, dazu eine Datei pro Einstellung in `views/setup/security/` |
| `queries/index.ts` | 819 | 14 (Re-Exporte), dazu zehn Dateien nach Domäne |
| `controls/generic/SettingsView.tsx` | 712 | 274, dazu `settingValues.ts` und `inputs/` mit fünf Widgets |
| `hooks/useWebsocket.tsx` | 634 | 563, dazu `authStorage.ts` und `requestError.ts` |
| `views/Dashboard.tsx` | 543 | 281, dazu `components/NavTabs.tsx`, `DashboardOverview.tsx` und `dashboardSections.tsx` |

- **`useWebsocket`:** Der Hook selbst bleibt eine Funktion mit rund 375 Zeilen. Ihn zu zerlegen wäre ein
  Umbau mit eigenem Risiko. Seine Hooks und Kontexte bleiben im Modul, weil 95 Importe und sieben Tests
  sie von dort holen.
- **Noch offen:** `views/setup/DeviceSettings.tsx` (849 Zeilen) ist eine einzige Komponente. Hooks und
  eine Komponente pro Tab herauszulösen, ist ein Umbau mit Zustand. Das bekommt einen eigenen PR.

### 12. Wiederholte UI-Bausteine und Zahlenformatierung

**UI-Bausteine**

- ~~`ToggleRow` gibt es zweimal~~: steht jetzt in `components/ToggleRow.tsx` (mit #11).
- `Field` gibt es dreimal: `components/Field.tsx:4`, `views/programs/ProgramInputs.tsx:14` und
  `views/setup/ChannelMeta.tsx:53`.
- Fünf Dateien haben ein eigenes lokales `Row`, vier ein eigenes `Section`.
- Die Zieh-Logik der Schieberegler ist dreifach kopiert: `controls/light/LevelBar.tsx:27–55`,
  `controls/ColorLightControl.tsx:41–65` und `controls/BlindsControl.tsx:43–75`.

**Zahlenformatierung**

- Sechs Dateien legen beim Laden ein eigenes `new Intl.NumberFormat(defaultLang, …)` an: `History.tsx`,
  `GeneralSettings.tsx`, `DeviceHistory.tsx`, `TimeChart.tsx`, `GenericControl.tsx` und
  `ParamsetView.tsx`. Insgesamt gibt es 29 `new Intl.*`.
- `defaultLang` wird nur einmal beim Start gesetzt. `formatNumber` in `lib/utils.ts:15` dagegen folgt
  der aktuellen Sprache und hält die Formatierer im Cache.

**Vorschlag:** Je ein gemeinsames `ToggleRow` und `Field`, einen Hook
`useSliderDrag(ref, axis, step)`, überall `formatNumber` und dazu ein `formatDate` mit Cache.

### 13. Zu lange Go-Funktionen, die nur aus einem großen `switch` bestehen: zum größten Teil erledigt

- **Fake-CCU.** `runScript` (412 Zeilen, 52 Fälle) und `call` (360 Zeilen, 29 XML-RPC-Methoden) sind
  jetzt Tabellen von Funktionen: `scriptHandlers` in `scripthandlers.go` und `rpcMethods` in
  `rpcmethods.go`. `fakeccu.go` ist von 2380 auf 1648 Zeilen geschrumpft.
- **Eine Funktion pro Nachrichtentyp** bei `handleSecurity` (257 Zeilen), `handleHeatingGroupChange` (163)
  und `handleSystemSettings` (153). Der Nachrichten-Struct hat einen Namen, der Handler prüft und
  verteilt.
- **Noch offen, weil es dort ein Umbau wäre und kein Verschieben:**
  - `handleRestore`, `handleDeviceFirmware`, `handleLogic` und `handleLanGateways`: Nach dem `switch`
    baut gemeinsamer Code die Antwort.
  - `handlePairing`: Es hat zwei `switch` hintereinander.
  - `main.run` (140 Zeilen), `rega.parseProgram` (103) und `occulite/home.go` (868 Zeilen).

### 14. `integration_test.go` wiederholt dieselben Abläufe

- **Wiederholte Abläufe.** 3154 Zeilen und 65 Tests, darin 298 Aufrufe von `send(t, conn, …)` und 286
  von `receive(…byRequestID…)`. Der Lite-Test hat dafür schon einen Helfer `liteCall`
  (`lite_integration_test.go:127`).
- **Zwei Port-Helfer.** `freePort` (`integration_test.go:32`) und `litePort`
  (`lite_integration_test.go:32`) tun dasselbe, aber nur `freePort` merkt sich, welche Ports er schon
  vergeben hat.

**Vorschlag:** Einen gemeinsamen Helfer `call()` und einen Port-Helfer in eine gemeinsame Testdatei legen
und die Tests nach Domänen aufteilen.

## Vorgeschlagene Reihenfolge

Jeder Schritt ist ein eigener PR:

1. ~~Build-Tags (#2)~~ erledigt.
2. ~~Fehlercodes vereinheitlichen (#3)~~ erledigt.
3. ~~`staticcheck` in der CI (#1)~~ erledigt; fürs Frontend mit Biome.
4. ~~Mechanische Go-Modernisierung und Logger (#5)~~ erledigt.
5. ~~Kopierte Frontend-Helfer und Reste (#4)~~ erledigt.
6. ~~Große Frontend-Dateien aufteilen (#11)~~ erledigt bis auf `DeviceSettings.tsx`.
7. ~~Handler vereinheitlichen (#6, #7)~~ erledigt; ~~die langen Handler aufteilen (#13)~~ größtenteils erledigt.
8. Der Rest: #8, #9, #10, #12, #14, `DeviceSettings.tsx`, `fakeccu.go`.
