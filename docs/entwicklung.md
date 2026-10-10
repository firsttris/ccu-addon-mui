# Entwicklung

Hier findest du alles, was du brauchst, um am Add-on zu arbeiten: die lokale Umgebung, die wichtigsten
Befehle, den Aufbau des Repositorys und die üblichen Handgriffe, etwa für eine neue Nachricht, eine neue
Kachel oder einen neuen Text.

## Voraussetzungen

- **Node.js** 22.12 oder neuer
- **Go** 1.27 oder neuer (für den Server, die Fake-CCU und die Stack-Tests)
- für die E2E-Tests einmal `npm run test:e2e:install`, das installiert Chromium für Playwright

```bash
git clone https://github.com/firsttris/ccu-addon-mui.git
cd ccu-addon-mui
npm install
```

## Drei Arten zu entwickeln

### Ohne CCU: gegen die Fake-CCU

```bash
npm run dev:fake
```

Das startet die Fake-CCU (mit `fixtures/demo-ccu.json`), den Go-Server und Vite zusammen. Die App läuft
dann auf **http://localhost:4200**, du meldest dich mit `Admin` / `secret` an (oder mit `Gast` / `gast`).
Hier kannst du alles gefahrlos ausprobieren, sogar die Werkseinstellungen. Willst du sehen, wie die App
reagiert, wenn ein Gerät einen Wert meldet, geht das so:

```bash
curl -X POST http://127.0.0.1:18080/fake/set \
  -d '{"interface":"HmIP-RF","address":"0008DA8A9F1234:1","datapoint":"STATE","value":true}'
```

### Gegen die eigene CCU

```bash
cp go-server/.env.example go-server/.env
# in go-server/.env: CCU_HOST, CCU_USER/CCU_PASS (falls die CCU Authentifizierung verlangt)
# und CALLBACK_HOST = IP dieses Rechners
npm run dev
```

Der Go-Server läuft dann auf deinem Rechner und spricht über das Netz mit deiner CCU. Damit Events
ankommen, muss die CCU deinen Rechner auf Port 9099 erreichen können. Wenn du den Server mit Strg+C
beendest, meldet er sich bei der CCU wieder ab.

### Nur die App, gegen das installierte Add-on

```bash
npm run start:fe:ccu3
```

Vite leitet `/ws/mui` an die CCU weiter, deren Adresse steht in `vite.config.mts` unter
`proxyTargets.ccu3`. Das ist praktisch, wenn du nur an der Oberfläche arbeitest.

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev:fake` | Fake-CCU + Server + App |
| `npm run dev` | Server + App gegen die CCU aus `go-server/.env` |
| `npm run start:fe:ccu3` | nur App, Proxy auf die CCU |
| `npm run build` | App bauen, Typen prüfen, Server für ARMv7 und amd64 bauen, `mui-<version>-arm-ccu3-raspi.tar.gz` und `mui-<version>-x86_64-pc.tar.gz` packen |
| `npm run generate:protocol` | `src/types/protocol.ts` aus `protocol/schema.json` erzeugen |
| `npm run export:ccu` | eine echte CCU nur lesend auslesen und als Fixture speichern |
| `npm test` | Unit-Tests (Vitest) |
| `npm run typecheck` | TypeScript prüfen |
| `npm run lint` | Formatierung und Lint-Regeln prüfen ([Biome](https://biomejs.dev), Regeln in `biome.json`) |
| `npm run lint:fix` | Formatieren und behebbare Lint-Befunde beheben |
| `npm run test:go` | Go-Tests |
| `npm run test:e2e` | Playwright mit Mock-WebSocket |
| `npm run test:stack` | Playwright gegen Go-Server + Fake-CCU |
| `npm run test:visual` | Screenshot-Vergleich (`:update` erneuert die Bilder; in der CI im Playwright-Image) |
| `npm run docs:screenshots` | die Bilder in `docs/` neu aufnehmen (Mock und Fake-CCU) |
| `npm run docs:tiles` | die bewegten Bilder der Kacheln (`docs/kacheln/`) neu aufnehmen, braucht `ffmpeg` |

Mehr zu den Tests findest du unter [Tests](tests.md).

## Aufbau des Repositorys

```
src/                 App (React, TypeScript); Aufbau in architektur.md
messages/            Texte der App, de.json und en.json
protocol/schema.json Vertrag zwischen App und Server
go-server/           Server, Fake-CCU, CCU-Export
fixtures/            Daten für Fake-CCU und Tests
e2e/, e2e-stack/     Playwright-Tests
addon_installer/     Dateien, die ins Add-on-Archiv kommen (Startskript, lighttpd, update_script)
scripts/             import-link-profiles.mjs (Verknüpfungsvorlagen aus OpenCCU-Base),
                     import-parameter-labels.mjs (Namen der Parameter aus OpenCCU-Base),
                     import-service-texts.mjs (Texte der Servicemeldungen aus OpenCCU-Base)
docs/                diese Dokumentation
```

## Konventionen

- **Nach den OpenCCU-Quellen bauen.** Bevor du eine Funktion baust, die die CCU betrifft, schau nach, wie
  die WebUI sie umsetzt. Die CCU hat viele Eigenheiten, und ihre Quellen sind die verlässlichste Referenz:
  [OpenCCU](https://github.com/OpenCCU/OpenCCU) mit den gepatchten Dateien der WebUI unter
  `buildroot-external/package/openccu-base/rootfs-patches/*/rootfs/www/`, und
  [OpenCCU-Base](https://github.com/OpenCCU/OpenCCU-Base) mit der ganzen WebUI (`www/webui/webui.js`,
  `www/config/easymodes/**`, `www/rega/esp/controls/*.fn`). Am einfachsten klonst du sie flach:
  `git clone --depth 1 https://github.com/OpenCCU/OpenCCU-Base`. Dort findest du Datenpunkte,
  Wertelisten, ReGa-Skripte und XML-RPC-Aufrufe.
- **Die Quelle nennen.** Wenn eine Quelle ein Detail entscheidet, schreib sie in den Kommentar oder die
  Commit-Nachricht, zum Beispiel „wie in der WebUI `door_opener.fn`“. So kann später jeder nachvollziehen,
  warum etwas so ist.
- **Formatierung und Lint-Regeln** setzt [Biome](https://biomejs.dev) durch (`biome.json`), die CI prüft
  beides. Lass vor dem Commit `npm run lint:fix` laufen; die Erweiterung `biomejs.biome` für VS Code
  formatiert beim Speichern.
- **Texte** der Oberfläche gibt es auf Deutsch und Englisch. Halte sie kurz und vermeide Fachjargon, wo es
  geht.
- **Ein Feature, ein Pull Request.** Kleine PRs lassen sich leichter prüfen. Gemergt wird, wenn die CI grün
  ist.
- **Keine Geheimnisse ins Repository**, also keine privaten Schlüssel und keine Passwörter. Die
  Testzertifikate erzeugen die Tests selbst, während sie laufen.

## Eine neue Nachricht

1. **Schema**: Leg in `protocol/schema.json` unter `properties` einen Eintrag
   `"meinTyp": {"$ref": "#/definitions/MeinTypCall"}` an. Unter `definitions` kommen dazu `MeinTypCall` mit
   `request` und `response` sowie die Definitionen `MeinTypRequest` und `MeinTypResponse`. Nimm die Antwort
   außerdem in `ServerMessage` auf. Alle Objekte bekommen `"additionalProperties": false`.
2. **Typen erzeugen**: `npm run generate:protocol`.
3. **Server**: Trag den Typ in `go-server/pkg/websocket/dispatch.go` im Dispatcher `dispatch` ein (was nur
   eine CCU hat, in `dispatch_ccu.go`), bei reinen Lesezugriffen auch in `parallelReads`. Den Handler
   schreibst du in die Datei seiner Domäne, etwa `devices.go`, `links.go`, `pairing.go`, `logic.go`
   (Programme und Systemvariablen) oder `favorites.go`; `websocket.go` selbst enthält nur den Server und die
   Verbindungen, `client.go` die einzelne Verbindung. Für Einstellungen gibt es `configure(...)` in
   `configure.go`: Es prüft die Rechte, führt die Aktion aus, schreibt ins Audit-Log und antwortet. Für das
   Bedienen von Geräten nimmst du `canOperate`.
   Räume, Gewerke, Kanäle, Namen, Favoriten und Servicemeldungen liest und ändert der Handler über `s.home`
   (die Schnittstelle `home.Source` in `go-server/pkg/home`), nicht direkt über die ReGa: Auf der CCU steckt
   die ReGa dahinter, auf openccu-lite dessen APIs. Nur was es ausschließlich auf der CCU gibt, etwa
   Programme oder Systemvariablen, ruft `s.regaClient` direkt.
4. **Fake-CCU**: Braucht die Aktion etwas Neues von der CCU, etwa ein Skript, eine XML-RPC-Methode oder eine
   CGI-Seite, bildest du es in `go-server/pkg/fakeccu` nach. Neue ReGa-Vorlagen erkennt die Fake-CCU von
   selbst an ihrem Text, du ergänzt nur die Antwort als neuen Fall in `runScript` (`fakeccu.go`).
5. **App**: Schreib in `src/queries/index.ts` eine Query oder Mutation, die `request('meinTyp', …)` aufruft.
   Die Typen kommen aus dem Schema.
6. **Tests**: Ein Go-Integrationstest in `go-server/integration_test.go` prüft die Antwort automatisch gegen
   das Schema. Ist es eine sichtbare Funktion, gehört noch ein Stack-Test in `e2e-stack/stack.spec.ts` dazu.

## Eine Kachel für ein neues Gerät

1. Schlag den Kanaltyp und seine Datenpunkte nach: in der Gerätebeschreibung in OpenCCU-Base
   (`opt/HMServer/HMIPServer.jar` → `de/eq3/cbcs/devicedescription/…` für HmIP, `firmware/rftypes/*.xml` für
   BidCos) und wie die WebUI das Gerät bedient (`www/rega/esp/controls/*.fn`).
2. Bau die Kachel unter `src/controls/`. Werte setzt du mit `useSetDataPoint`, gemeinsame Bausteine findest
   du in `src/components/Tile.tsx` und `Gestures.tsx`.
3. Trag den Kanaltyp in `src/controls/registry.ts` ein, mit Abschnitt und `per: 'channel'` oder
   `'device'`.
4. Nimm einen Kanal mit den echten Datenpunkten in den Mock (`e2e/helpers/websocketMock.ts`) auf und schreib
   einen Test in `e2e/frontend-mocked-websocket.spec.ts`. Sieht etwas neu aus, erneuere auch die Screenshots.

Echte Daten bekommst du über einen Export deiner eigenen CCU:

```bash
npm run export:ccu -- -o ../fixtures/meine-ccu.json -anonymize
```

Der Export ändert nichts an deiner CCU, er liest nur: Räume, Gewerke, Kanäle mit ihren Werten,
Gerätebeschreibungen und Paramsets. Mit `-anonymize` werden die Namen von Räumen, Gewerken und Geräten
ersetzt, damit du die Datei teilen kannst. Passwörter lassen sich nicht exportieren, die Fixture bekommt
deshalb `Admin` / `secret`. Mit `go run ./cmd/fakeccu -fixture …` (in `go-server/`) läuft deine eigene CCU
dann als Fake.

## Texte und Übersetzungen

Die Texte stehen in `messages/de.json` und `messages/en.json`. Beide Dateien haben dieselben Schlüssel, der
Test `src/i18n/messages.test.ts` passt darauf auf. Paraglide JS macht daraus typisierte Funktionen:

```tsx
import { m } from '../paraglide/messages';
<span>{m.WINDOWS_OPEN()}</span>
<span>{m.MOTION_MINUTES_AGO({ minutes: 3 })}</span>
```

Vite übersetzt die Texte beim Start und bei jeder Änderung selbst. Brauchst du es einmal von Hand:

```bash
npx paraglide-js compile --project ./project.inlang --outdir ./src/paraglide \
  --emit-ts-declarations --strategy preferredLanguage baseLocale
```

Geschweifte Klammern in Texten sind Platzhalter, nimm `{name}` also nur für Variablen. Die Sprache richtet
sich nach dem Browser, sonst ist es Englisch.

## Verknüpfungsvorlagen aktualisieren

Die Profile der Direktverknüpfungen stammen aus den Easymodes der WebUI:

```bash
node scripts/import-link-profiles.mjs /pfad/zu/OpenCCU-Base
```

Das Skript liest `www/config/easymodes/<Empfänger>/<Sender>.tcl` samt Übersetzungen und schreibt daraus
`src/controls/links/linkProfiles.json`.

Die importierten Daten (Verknüpfungsprofile, Parameternamen, Texte der Servicemeldungen) stehen wie ihre
Quelle, die WebUI, unter der Apache-Lizenz 2.0, nicht unter der AGPL. [THIRD_PARTY_LICENSES.md](https://github.com/firsttris/ccu-addon-mui/blob/main/THIRD_PARTY_LICENSES.md)
nennt sie und liegt dem Add-on bei; ein neues Import-Skript gehört dort mit in die Liste.

## Umgebungsvariablen

Der Server liest seine Einstellungen aus Umgebungsvariablen (`go-server/pkg/config/config.go`). Auf der CCU
kommen sie aus `/usr/local/etc/config/mui.conf`, lokal aus `go-server/.env`.

| Variable | Standard | Bedeutung |
|---|---|---|
| `CCU_HOST` | `localhost` | Adresse der CCU |
| `CCU_USER`, `CCU_PASS` | – | Basic Auth für ReGa und XML-RPC, falls die CCU sie verlangt (nur aus dem LAN; auf der CCU nicht nötig) |
| `CALLBACK_HOST` | `127.0.0.1` | Adresse, unter der die CCU den Event-Server erreicht |
| `RPC_SERVER_PORT` | `9099` | Port des Event-Servers |
| `WS_PORT`, `WS_BIND_HOST` | `8088`, `127.0.0.1` | WebSocket-Server |
| `REGA_PORT` | `8183` bei `localhost`, sonst `8181` | ReGa |
| `SYSVAR_INTERVAL` | `5` | Sekunden zwischen zwei Abfragen der Systemvariablen, solange eine App sie zeigt |
| `RPC_PORT`, `HMIP_PORT`, `VIRTUAL_DEVICES_PORT` | bei `localhost` aus `/etc/config/InterfacesList.xml` (sonst `32001`, `32010`, `39292`), aus dem LAN `2001`, `2010`, `9292` | Funkdienste |
| `WIRED_PORT` | bei `localhost` aus `InterfacesList.xml` (nur mit Wired-Gateway), sonst `0` (aus) | BidCos-Wired (hs485d); aus dem LAN von Hand setzen, meist `2000` |
| `CCU_WEBUI_URL` | `http://<CCU_HOST>` | WebUI für JSON-RPC und CGI-Seiten |
| `AUTH_MODE` | `ccu` | `none` schaltet die Anmeldung ab |
| `AUTH_KEY_FILE`, `SESSIONS_FILE`, `AUDIT_LOG_FILE`, `PUSH_FILE`, `DIAGRAMS_FILE`, `RULES_FILE`, `TILES_FILE` | unter `/usr/local/etc/config` | Dateien des Add-ons |
| `DIAGRAMS_DIR` | `/usr/local/mui-diagrams` | Diagrammwerte |
| `DATA_DIR` | – | ein Verzeichnis für alle Dateien des Add-ons und die Diagrammwerte; auf openccu-lite `/usr/local/etc/config/addons/mui`, weil das Add-on dort nur in eigene Verzeichnisse schreiben darf. Einzeln gesetzte Pfade gehen vor |
| `BACKUP_DIR` | `/usr/local/tmp/mui-backups` auf der CCU, sonst `$TMPDIR/mui-backups` | Backups bis zum Download, Uploads |
| `CCU_CONFIG_DIR`, `CCU_STATUS_DIR` | `/etc/config`, `/var/status` | Konfiguration der CCU |
| `ADDONS_DIR`, `SYSLOG_CONFIG`, `LOG_DIR`, `TIME_CONF_FILE`, `NTP_CLIENT_FILE`, `TZ_FILE`, `GROUPS_FILE` | Pfade der CCU | Zusatzsoftware, Logs, Uhr, Heizgruppen |
| `DEVICE_FIRMWARE_SERVER` | `https://ccu3-update.homematic.com` | eQ-3-Updateserver für Geräte-Firmware |
| `CCU_WWW_DIR` | `/www` | Dateien der WebUI (Gerätebilder, Texte der Servicemeldungen) |
| `APP_DIR` | `/usr/local/addons/mui` | die installierte App; `assets/` liefert der Server gzip-gepackt aus |
| `USERFS_DIR`, `FIRMWARE_DOWNLOAD_FILE` | `/usr/local`, `/usr/local/tmp/firmwareUpdateFile` | Freier Speicher und Ziel des CCU-Firmware-Downloads |
| `FIRMWARE_UPLOAD_DIR`, `FIRMWARE_STAGED_LINK` | `/usr/local/tmp`, `/usr/local/.firmwareUpdate` | Hochgeladene CCU-Updates und der Link, über den die WebUI das geprüfte Update bereitstellt |
| `CCU_FIRMWARE_RELEASES` | `https://github.com/openccu/openccu/releases/download` | Releases mit SHA256-Dateien |
| `ADDON_RELEASE_URL`, `ADDON_UPDATE_DIR` | GitHub-API der neuesten Release, `/usr/local/tmp` | Update des Add-ons ohne Neustart der CCU: woher die neue Version kommt und wo sie ausgepackt wird |
| `OCCULITE_URL`, `OCCULITE_TOKEN_FILE` | `http://127.0.0.1`, `/run/occulite/addon-tokens/mui.api` | nur openccu-lite: occulited und das API-Token des Add-ons |
| `LITE_FORCE` | – | nur openccu-lite: startet das Lite-Binary auch ohne openccu-lite, etwa gegen die Fake-CCU mit `-lite` |
| `PUSH_SUBJECT` | GitHub-URL | Kontakt in Push-Anfragen |
| `DEBUG` | `false` | ausführliches Log |

Wie man alle Pfade für eine Testumgebung umbiegt, siehst du an den Stack-Tests in
`playwright.stack.config.ts`.

## openccu-lite

Aus demselben Code entstehen zwei Server: `go build` für CCU3 und OpenCCU, `go build -tags lite` für
[openccu-lite](https://github.com/hobbyquaker/openccu-lite), das keine ReGa und keine WebUI hat.

- **Was sich unterscheidet**, steht in Dateien mit Build-Tag: `main_ccu.go` und `main_lite.go` verbinden die
  Plattform, `pkg/websocket/dispatch_ccu.go` verteilt, was nur eine CCU hat (Programme, Systemvariablen,
  Alarme, Benutzer, die Systemeinstellungen der WebUI). Die Handler-Dateien dafür tragen `//go:build !lite`.
  Das Hausmodell (Räume, Gewerke, Kanäle, Namen) liegt hinter `home.Source`: auf der CCU `pkg/rega`, auf
  openccu-lite `pkg/occulite`.
- **Werte und Events:** Auf openccu-lite meldet sich der Server nicht per `init` als Callback-Server an.
  Er liest beim Start den Zustandsspeicher (`/api/rpc/v1/state`) und folgt ab dort dem Event-Stream
  (`/api/rpc/v1/events`), der nach einer Unterbrechung das Verpasste nachholt; meldet er `resync`, liest
  der Server den Zustandsspeicher neu. Die Funkdienste erreicht er über occulites `lite-rpc`
  (`ccurpc.NewProxy`, XML-RPC unter `/api/rpc/v1/xmlrpc/<Interface>`), nicht über ihre lokalen Ports. Was
  ein Nutzer auslöst, geht mit dessen Sitzung (`Client.WithToken`, `Home.ForSession`), alles andere mit dem
  Token des Add-ons.
- **Eigene Daten:** Kachel-Layouts und die Kachelwahl je Kanal liegen wie auf der CCU in `mui-tiles.json`
  (`pkg/tiles`), auf openccu-lite im Datenverzeichnis. Der Modus von Eingangskanälen und die Favoritenlisten
  liegen dort in `mui-lite.json`, weil es keine ReGa für sie gibt. Räume, Gewerke und Namen ändert der Server in occulites Metadaten-Speicher; Räume heißen dort
  Pfade (`room/eg/wohnzimmer`), Kanäle `HmIP-RF.<Adresse>`, und die App bekommt daraus feste Zahlen-IDs
  (`occulite.ID`).
- **Geräteverwaltung:** Anlernen, Paramsets und Direktverknüpfungen laufen wie auf der CCU über XML-RPC,
  hier durch `lite-rpc`.
  Einen Posteingang hat openccu-lite nicht: Neu sind dort die Geräte ohne Eintrag im Metadaten-Speicher,
  *Übernehmen* legt ihn mit dem Namen `<Typ> <Adresse>` an. Heizgruppen gehen über occulites
  `/api/system/v1/groups` (`occulite.Groups`), Gerätefirmware lädt und verteilt occulite selbst.
- **Servicemeldungen und Gesundheit:** Die Servicemeldungen sammelt occulited selbst
  (`/api/system/v1/service-messages`); eine Sticky-Meldung bestätigt der Server, indem er sie am Gerät
  zurücksetzt. Geräteprobleme und Geräte-Gesundheit kommen aus den Werten der Wartungskanäle. Alarme gibt
  es ohne ReGa nicht; Push-Benachrichtigungen und Regeln laufen unverändert.
- **Hinweise statt Lücken:** Statt der Programme zeigt die App auf openccu-lite, wo Automationen dort laufen
  (Node-RED unter `/addons/red/`, die Zusatzsoftware, Direktverknüpfungen), und unter *System* Links auf
  occulites eigene Seiten (`src/views/setup/LiteHints.tsx`). In occulites Rahmen übernimmt sie dessen
  Hell/Dunkel und Sprache (`?theme=`, `?lang=`, `postMessage` `openccu-lite:theme`).
- **Anmeldung:** Auf openccu-lite meldet occulites Gate vor `/addons/` die Sitzung im Header
  `X-Occulite-Session`, auch am WebSocket-Upgrade. Deshalb verbindet sich die App installiert mit
  `/addons/mui/ws`.
- **Die App** ist für beide gleich. Bei der Anmeldung schickt der Server `platform` und `capabilities` mit,
  danach blendet sie aus, was es nicht gibt.
- **Paket:** `make build-lite` baut die Server für aarch64 und x86_64, `npm run build` packt daraus
  `mui-<version>-aarch64-lite.tar.gz` und `mui-<version>-x86_64-lite.tar.gz` mit `openccu-lite.json`. Das
  Add-on läuft dort als eigener Benutzer und schreibt nur nach `/usr/local/etc/config/addons/mui`
  (`DATA_DIR`); `addon_installer/rc.d/mui-lite` und `addon_installer/lite/` sind die Teile dafür.
- **Testen:** `go test -tags lite ./...` startet den Lite-Server gegen die Fake-CCU im Lite-Modus
  (`fakeccu.CCU.Lite`): keine ReGa, dafür occulites APIs aus der Fixture. Von Hand geht das mit
  `go run ./cmd/fakeccu -lite`, das die Umgebung für den Server ausgibt.

Der Plan für die weiteren Schritte steht in [plan-openccu-lite.md](plan-openccu-lite.md).

## Release

Ein Release beginnt mit einem Tag `vX.Y.Z`, nach demselben Schema wie in den anderen Projekten
([firsttris/workflows](https://github.com/firsttris/workflows)). Den Tag kannst du auf zwei Wegen anlegen:

- **ohne Checkout**: unter Actions → *Bump version* → patch, minor oder major (`bump.yml`). Das erhöht die
  Version in `package.json` und `package-lock.json`, committet sie als `Release vX.Y.Z` auf `main`, setzt den
  Tag und startet `release.yml` darauf.
- **lokal**: mit `npm run release:patch` (oder `:minor`, `:major`). Commit und Tag werden dann per
  `postversion` gepusht.

`release.yml` lässt anschließend Build, Go- und Playwright-Tests laufen und legt die Release mit den
Archiven `mui-<version>-arm-ccu3-raspi.tar.gz` und `mui-<version>-x86_64-pc.tar.gz` an. Die Notizen erzeugt
GitHub aus den Pull Requests seit der letzten Version. Lokal baut `npm run build` dieselben Archive, und
jeder Build in der CI hängt sie als Artefakt `addon` an.
