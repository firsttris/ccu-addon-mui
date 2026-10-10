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
| 8 | Selbstgebaute TTL-Caches neben `cachedList[T]` (erledigt) | Go | M |
| 9 | Globale Variablen, Abhängigkeit von der Aufrufreihenfolge (erledigt bis auf `SetHome`) | Go | M |
| 10 | Handler gehen an `home.Source` vorbei direkt zur ReGa (erledigt) | Go | M |
| 11 | Zu große Frontend-Dateien (erledigt) | Frontend | L |
| 12 | Wiederholte UI-Bausteine und Zahlenformatierung (erledigt) | Frontend | M |
| 13 | Zu lange Go-Funktionen, die nur aus einem großen `switch` bestehen (erledigt) | Go | L |
| 14 | `integration_test.go` wiederholt dieselben Abläufe (erledigt) | Go-Tests | M |

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

### 8. Selbstgebaute TTL-Caches neben `cachedList[T]`: erledigt

`messages_watch.go:56` bietet mit `cachedList[T]` schon einen generischen Cache. Viermal ist trotzdem
von Hand derselbe Cache aus Mutex, Wert und Zeitstempel gebaut:

- `health.go:28`
- `device_firmware.go:38`
- `channel_options.go:19`
- `selfupdate.go:114`

**Vorschlag:** `cachedList[T]` zu einem `cached[T]` verallgemeinern und überall nutzen.

**Erledigt:** `cache.go` hat jetzt `cached[T]`. `get(maxAge, read)` liest neu, wenn der Wert zu alt
ist, und behält einen fehlgeschlagenen Lesevorgang nicht. Den Cache nutzen jetzt die Meldungen, die
Benutzer für die automatische Anmeldung, die Kanäle mit „nur lesen“ und der Firmware-Katalog.

Zwei Caches bleiben, wie sie sind:

- `health.go`: Die Grenzwerte für schwache Batterien werden pro Gerät gemerkt, nicht als ein Wert.
  Der Cache ist aber kein globaler Wert mehr, sondern ein Feld von `Server` (siehe #9).
- `selfupdate.go`: Der Cache gehört zum Paket `selfupdate` und behält auch Fehler. Nach einem
  Fehler fragt er schon nach 10 Minuten wieder, sonst nach 6 Stunden.

### 9. Globale Variablen, Abhängigkeit von der Aufrufreihenfolge: erledigt bis auf `SetHome`

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

**Erledigt:**

- `SetGroupsFile`, `SetClockFiles` und die globalen Pfade gibt es nicht mehr. Die Handler lesen die
  Pfade aus `s.cfg`. `clockFiles` fasst die Pfade der Uhrzeit zusammen, und die Lese- und
  Schreibfunktionen bekommen ihren Pfad als Parameter. Die Tests übergeben eigene Pfade.
- `lowBatLimits` ist ein Feld von `Server`.
- `NewServer` setzt `regaClient` nur noch einmal, über `SetRega`.

**Bleibt:** `SetRega` setzt `s.home`, auf openccu-lite setzt `main_lite.go` die Quelle danach mit
`SetHome`. `homeModel.SetTiles` braucht die Kacheln aus `main.go`. Beides steht an genau einer Stelle
und ist im Code kommentiert. Eine eigene Verdrahtung dafür wäre mehr Code, als sie spart.

### 10. Handler gehen an `home.Source` vorbei direkt zur ReGa: erledigt

`s.regaClient` kommt in 16 Dateien von `pkg/websocket` vor, auch in Dateien, die beide Builds nutzen:
`heating_groups.go:260` und `:285` sowie `diagrams.go:60` und `:257`. Auf openccu-lite ist
`regaClient` `nil`. Das funktioniert nur, weil die Aufrufe dort nie erreicht werden.

**Vorschlag:** Diese Aufrufe hinter Schnittstellen legen, so wie es `GroupService` schon tut. Dann
kennen gemeinsam genutzte Dateien `*rega.Client` gar nicht.

**Erledigt, ohne neue Schnittstellen:** `regaClient` steht jetzt in `ccuState` (`state_ccu.go`). Der
Build für openccu-lite kennt das Feld also gar nicht. Ein Zugriff aus einer gemeinsam genutzten
Datei fällt deshalb schon beim Übersetzen auf. Die gemeinsam genutzten Dateien rufen stattdessen
kleine Funktionen auf, die je Build einmal existieren:

- `rega_ccu.go`: die Aufrufe an die ReGa
- `rega_lite.go`: die Antworten für openccu-lite (keine Daten oder `errNoRega`)

Die Alarme liest `alarmReader`. Die Funktion gibt die Lesefunktion zurück, oder `nil`, wenn es
keine gibt. Das Anlegen, Bearbeiten, Umbenennen und Löschen von Systemvariablen ist aus
`objects.go` als `handleSysvarChange` nach `sysvars.go` umgezogen, das nur die CCU baut.

## Groß: lange Dateien und Funktionen

### 11. Zu große Frontend-Dateien: erledigt

Bis auf `DeviceSettings.tsx` ist der Code jeweils nur verschoben. Ein Zeilenvergleich vor und nach dem
Umzug zeigt dieselben Zeilen.

| Datei | Vorher | Nachher |
|---|---|---|
| `views/setup/Security.tsx` | 782 | 163, dazu eine Datei pro Einstellung in `views/setup/security/` |
| `queries/index.ts` | 819 | 14 (Re-Exporte), dazu zehn Dateien nach Domäne |
| `controls/generic/SettingsView.tsx` | 712 | 274, dazu `settingValues.ts` und `inputs/` mit fünf Widgets |
| `hooks/useWebsocket.tsx` | 634 | 563, dazu `authStorage.ts` und `requestError.ts` |
| `views/Dashboard.tsx` | 543 | 281, dazu `components/NavTabs.tsx`, `DashboardOverview.tsx` und `dashboardSections.tsx` |
| `views/setup/DeviceSettings.tsx` | 718 | 237, dazu fünf Dateien und ein Test in `views/setup/device/` |

- **`useWebsocket`:** Der Hook selbst bleibt eine Funktion mit rund 375 Zeilen. Ihn zu zerlegen wäre ein
  Umbau mit eigenem Risiko. Seine Hooks und Kontexte bleiben im Modul, weil 95 Importe und sieben Tests
  sie von dort holen.
- **`DeviceSettings`:** Die Seite war eine einzige Komponente. Sie hält jetzt nur noch den Zustand, der
  ihre Teile verbindet: die Entwürfe der Änderungen, den gezeigten Kanal und den Tab. Der Rest steht in
  `views/setup/device/`:
  - `deviceSettingsModel.ts`: reine Funktionen, mit Unit-Tests. `withDraft` und `changesOf` für die
    Entwürfe, `transferOf` für den Stand der Übertragung, `channelCardsOf` für die Kanalkarten, dazu
    `weekProgramKindOf` und `weekProgramTargetsOf`.
  - `useDeviceSettings.ts`: die Hooks `useMasterSettings` (die MASTER-Paramsets) und `useConfigTransfer`
    (`CONFIG_PENDING` nach dem Speichern).
  - `DeviceHeader.tsx` mit dem Dialog zum Löschen, `ChannelsTab.tsx` mit den Kanalkarten, `SaveBar.tsx`
    mit der Bestätigung der Änderungen.

  Die Gerätseite sieht pixelgenau aus wie vorher. Verglichen wurden 18 Bilder: acht Geräte und Tabs auf
  Desktop und Telefon, dazu der Dialog zum Löschen. Abweichungen gibt es nur in der Uhrzeit der Kopfzeile.

### 12. Wiederholte UI-Bausteine und Zahlenformatierung: erledigt

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

**Erledigt:**

- **`Field`:** Es gibt nur noch `components/Field.tsx`. Die Variante `dense` ist die kleinere
  Form, die der Programm-Editor und die Benachrichtigungsregeln nutzen. Das `Field` in
  `ChannelMeta.tsx` war kein Formularfeld, sondern eine Zeile mit der Beschriftung neben den
  Bedienelementen. Es heißt jetzt `MetaRow`.
- **Zieh-Logik:** Der Hook `hooks/useSliderDrag.ts` übernimmt sie, mit Unit-Tests. Der Wert folgt
  dem Zeiger und wird beim Loslassen einmal gesendet, ein abgebrochenes Ziehen sendet nichts.
  Pfeiltasten senden erst, wenn sie ruhen. Mit `tapOnTouch` setzt ein Finger den Wert nur durch
  Tippen, so wie bei den Rollläden. `LevelBar`, `HueBar` und `BlindsControl` nutzen den Hook.
  Unverändert gleich ist ein Wert jetzt bei allen drei kein Telegramm mehr. Vorher sendeten der
  Farbton und die Pfeiltasten der Rollläden ihn trotzdem.
- **Zahlen und Daten:** `lib/format.ts` hält die Intl-Formate pro Sprache und Optionen im Cache:
  `numberFormat`, `formatNumber` (aus `lib/utils.ts` hierher umgezogen) und `formatDate`. Kein
  Modul legt mehr beim Laden ein eigenes `Intl.NumberFormat` oder `Intl.DateTimeFormat` an.

Zwei Dinge bleiben, wie sie sind:

- Die lokalen `Row` und `Section` tragen nur denselben Namen. Ihr Aufbau und ihre Bedeutung
  unterscheiden sich, etwa ein `fieldset` mit Legende oder eine Zeile mit Hinweis und
  Zurücksetzen. Nur `Links.tsx` und `Pairing.tsx` haben dieselbe einzeilige Flex-Zeile. Dafür
  lohnt sich keine gemeinsame Komponente.
- `TimeModuleDialog.tsx`, `programModel.ts` und `deviceHealth.ts` bekommen die Sprache als
  Parameter, damit ihre Tests sie festlegen können.

Die 72 Bildschirmfotos von `visual.spec.ts` sind pixelgleich mit `main`.

### 13. Zu lange Go-Funktionen, die nur aus einem großen `switch` bestehen: erledigt

- **Fake-CCU.** `runScript` (412 Zeilen, 52 Fälle) und `call` (360 Zeilen, 29 XML-RPC-Methoden) sind
  jetzt Tabellen von Funktionen: `scriptHandlers` in `scripthandlers.go` und `rpcMethods` in
  `rpcmethods.go`. `fakeccu.go` ist von 2380 auf 1648 Zeilen geschrumpft.
- **Eine Funktion pro Nachrichtentyp** bei `handleSecurity` (257 Zeilen), `handleHeatingGroupChange` (163)
  und `handleSystemSettings` (153). Der Nachrichten-Struct hat einen Namen, der Handler prüft und
  verteilt.
- **Die Handler mit gemeinsamem Code nach dem `switch`** sind jetzt umgebaut, nicht nur verschoben:

  | Funktion | Vorher | Nachher | Wie |
  |---|---|---|---|
  | `handleLogic` | 102 | 20 | eine Methode pro Nachricht; Programm starten und Variable setzen über `operate` |
  | `handleServiceMessages` | 58 | 17 | eine Methode pro Nachricht; Bestätigen über `operate` |
  | `handleRestore` | 105 | 49 | Tabelle `restoreSteps`: pro Schritt eine Funktion und was danach ins Log kommt |
  | `handleDeviceFirmware` | 123 | 23 | drei Lese-Methoden, Tabelle `deviceFirmwareChanges` für die Änderungen |
  | `handleLanGateways` | 141 | 48 | Tabelle `gatewayChanges`: pro Änderung ihr Audit-Eintrag und die Änderung |
  | `handlePairing` | 185 | 50 | Tabelle `pairingReads` für das Lesen, eine Methode pro Änderung |
  | `rega.parseProgram` | 103 | 17 | Tabelle `programLines`: pro Zeilenart des Skripts eine Funktion |
  | `main.run` | 140 | 68 | `setupPush`, `setupDiagrams`, `eventHandler` und `shutdown` |

  - **`operate`** ist das Gegenstück zu `configure` für das Bedienen. Gäste dürfen nicht, und das Ergebnis
    kommt ins Audit-Log. Beide teilen sich den Schluss `finishChange`. Ein Fehler, der `errForbidden`
    einpackt, antwortet mit `FORBIDDEN`, etwa ein Programm, das nur Administratoren starten dürfen.
  - **Eigene Fehler mit Code statt Sonderwegen:** `handleDeviceFirmware` und `handleLanGateways` geben
    ungültige Werte, Fehler des Update-Servers und unbekannte Dateien als Fehlerwerte zurück. `failChange`
    nimmt dafür die eigenen Codes des Handlers.
  - **Kleine Unterschiede:**
    - Die Fehlertexte dieser Fälle beginnen jetzt wie die anderen mit „… failed:“. Die Codes sind
      unverändert.
    - Das Audit-Log nennt den vorigen Wert jetzt auch bei einer Änderung, die ReGa ablehnt.
- **`occulite/home.go`** (859 Zeilen) war schon in fünf Abschnitte gegliedert. Jeder Abschnitt ist jetzt
  eine eigene Datei: `home_groups.go`, `home_channels.go`, `home_operating.go`, `home_data.go` und
  `home_pairing.go`. `home.go` behält den Zustand und hat noch 176 Zeilen. Der Inhalt ist nur verschoben.

### 14. `integration_test.go` wiederholt dieselben Abläufe: erledigt

- **Wiederholte Abläufe.** 3154 Zeilen und 65 Tests, darin 298 Aufrufe von `send(t, conn, …)` und 286
  von `receive(…byRequestID…)`. Der Lite-Test hat dafür schon einen Helfer `liteCall`
  (`lite_integration_test.go:127`).
- **Zwei Port-Helfer.** `freePort` (`integration_test.go:32`) und `litePort`
  (`lite_integration_test.go:32`) tun dasselbe, aber nur `freePort` merkt sich, welche Ports er schon
  vergeben hat.

**Vorschlag:** Einen gemeinsamen Helfer `call()` und einen Port-Helfer in eine gemeinsame Testdatei legen
und die Tests nach Domänen aufteilen.

**Erledigt:**

- **Gemeinsame Testdatei:** `stack_helpers_test.go` nutzen beide Builds. Darin stehen:
  - `freePort`, der sich vergebene Ports merkt (`litePort` entfällt)
  - das Senden, Lesen und Prüfen gegen `protocol/schema.json`
  - `call(t, conn, request)`: Er sendet eine Anfrage und gibt ihre Antwort zurück, bei `auth` und
    `login` die `auth_response`.
- **`call` statt Paaren:** 297 Paare aus `send` und `receive(byRequestID(…))` sowie 10 Anmeldungen sind
  jetzt Aufrufe von `call`. Es bleiben nur die Stellen, die mehrere Nachrichten zugleich erwarten, etwa die
  Antwort und das Event eines Schaltbefehls.
- **Lite-Test:** `liteCall` vergibt nur noch die `requestId` und ruft `call`. Damit prüft jetzt auch der
  Lite-Test jede Antwort gegen das Protokoll-Schema.
- **Aufteilung nach Domänen:** `integration_test.go` (vorher 3154 Zeilen) enthält nur noch den Aufbau des
  Stacks und zwei Grundtests. Die übrigen Tests stehen in diesen Dateien:
  - `stack_devices_test.go`: Geräte, Räume, Verknüpfungen, Anlernen, Kacheln, Heizgruppen
  - `stack_logic_test.go`: Programme, Systemvariablen, Alarme, Skripte, Regeln, Diagramme
  - `stack_system_test.go`: Einstellungen, Benutzer, Backups, Firmware, Add-ons

## Zweite Runde

Nach der ersten Runde habe ich noch einmal nachgemessen: die größten Dateien und die Funktionen über
90 Zeilen. Diese Stellen lagen in der ersten Runde unter der Schwelle oder sind Test-Code.

| # | Stelle | Bereich | Stand |
|---|---|---|---|
| 15 | `handleUsers` (101 Zeilen) | Go | erledigt |
| 16 | `rega.parseChannels` (95 Zeilen) | Go | erledigt |
| 17 | `ccu-export` `export` (108 Zeilen) | Go | erledigt |
| 18 | `Diagrams.tsx` (647), `TimeChart.tsx` (620), `WeekProgramSheet.tsx` (558), `Links.tsx` (540) | Frontend | offen |
| 19 | Fake-CCU: `fakeccu.go` (1648 Zeilen), Handler mit 100–126 Zeilen | Go-Tests | offen |

- **#15 `handleUsers`:** Es gibt jetzt eine Methode pro Nachricht: `listUsers`, `deleteUser` und
  `saveUser`. `userByID` sucht den Benutzer, wie er gerade ist.
- **#16 `parseChannels`:** Die Tabelle `channelLines` hat pro Zeilenart die Mindestzahl der Felder und
  eine Funktion, wie `programLines` bei `parseProgram`. Dazu kommen `channelOf` für die „C“-Zeile und
  `withStatus` für Batterie und Erreichbarkeit.
- **#17 `export`:** `channelSet` sammelt die Kanäle einmal in der Reihenfolge, in der sie auftauchen.
  `exportChannels` und `exportGroups` lesen sie.

## Vorgeschlagene Reihenfolge

Jeder Schritt ist ein eigener PR:

1. ~~Build-Tags (#2)~~ erledigt.
2. ~~Fehlercodes vereinheitlichen (#3)~~ erledigt.
3. ~~`staticcheck` in der CI (#1)~~ erledigt; fürs Frontend mit Biome.
4. ~~Mechanische Go-Modernisierung und Logger (#5)~~ erledigt.
5. ~~Kopierte Frontend-Helfer und Reste (#4)~~ erledigt.
6. ~~Große Frontend-Dateien aufteilen (#11)~~ erledigt bis auf `DeviceSettings.tsx`.
7. ~~Handler vereinheitlichen (#6, #7)~~ erledigt; ~~die langen Handler aufteilen (#13)~~ größtenteils erledigt.
8. ~~Caches, Globale, ReGa-Aufrufe (#8, #9, #10)~~ erledigt.
9. ~~UI-Bausteine und Zahlenformatierung (#12)~~ erledigt.
10. ~~Integrationstests (#14)~~ erledigt.
11. ~~`DeviceSettings.tsx` (#11)~~ erledigt.
12. ~~Der Rest von #13~~ erledigt. Damit sind alle Befunde abgearbeitet.
