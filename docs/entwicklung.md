# Entwicklung

Alles, was man braucht, um am Add-on zu arbeiten: lokale Umgebung, Befehle, Aufbau des Repositorys und die
üblichen Handgriffe wie eine neue Nachricht, eine neue Kachel oder ein neuer Text.

## Voraussetzungen

- **Node.js** 22.12 oder neuer
- **Go** 1.27 oder neuer (für Server, Fake-CCU und Stack-Tests)
- für die E2E-Tests einmal `npm run test:e2e:install` (Chromium für Playwright)

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

Startet Fake-CCU (mit `fixtures/demo-ccu.json`), Go-Server und Vite zusammen. Die App läuft auf
**http://localhost:4200**, Anmeldung `Admin` / `secret` (oder `Gast` / `gast`). Alles lässt sich gefahrlos
ausprobieren, auch Werkseinstellungen. Ein Gerät einen Wert melden lassen:

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

Der Go-Server läuft dann auf deinem Rechner und spricht über das Netz mit der CCU. Die CCU muss deinen
Rechner auf Port 9099 erreichen, sonst kommen keine Events an. Mit Strg+C beendet, meldet sich der Server
bei der CCU wieder ab.

### Nur die App, gegen das installierte Add-on

```bash
npm run start:fe:ccu3
```

Vite leitet `/ws/mui` an die CCU weiter (Adresse in `vite.config.mts`, `proxyTargets.ccu3`). Praktisch für
reine Oberflächenarbeit.

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
| `npm run test:go` | Go-Tests |
| `npm run test:e2e` | Playwright mit Mock-WebSocket |
| `npm run test:stack` | Playwright gegen Go-Server + Fake-CCU |
| `npm run test:visual` | Screenshot-Vergleich (`:update` erneuert die Bilder; in der CI im Playwright-Image) |
| `npm run docs:screenshots` | die Bilder in `docs/` neu aufnehmen (Mock und Fake-CCU) |

Mehr zu den Tests in [Tests](tests.md).

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
                     import-service-texts.mjs (Texte der Servicemeldungen aus OpenCCU-Base)
docs/                diese Dokumentation
```

## Konventionen

- **Nach den OpenCCU-Quellen bauen.** Jede Funktion, die die CCU betrifft, wird in den Quellen der WebUI
  nachgeschlagen und nicht aus dem Gedächtnis gebaut:
  [OpenCCU](https://github.com/OpenCCU/OpenCCU) (gepatchte WebUI-Dateien unter
  `buildroot-external/package/openccu-base/rootfs-patches/*/rootfs/www/`) und
  [OpenCCU-Base](https://github.com/OpenCCU/OpenCCU-Base) (die ganze WebUI: `www/webui/webui.js`,
  `www/config/easymodes/**`, `www/rega/esp/controls/*.fn`). Am einfachsten flach klonen:
  `git clone --depth 1 https://github.com/OpenCCU/OpenCCU-Base`. Datenpunkte, Werte-Listen, ReGa-Skripte
  und XML-RPC-Aufrufe kommen von dort.
- **Die Quelle nennen**: in Kommentaren und Commit-Nachrichten, wo sie ein Detail entscheidet, z. B. „wie in der
  WebUI `door_opener.fn`“.
- **Texte** der Oberfläche auf Deutsch und Englisch, kurz und ohne Fachjargon, wo es geht.
- **Ein Feature, ein Pull Request.** Gemergt wird, wenn die CI grün ist.
- **Keine Geheimnisse ins Repository**: keine privaten Schlüssel, keine Passwörter. Testzertifikate erzeugen
  die Tests zur Laufzeit.

## Eine neue Nachricht

1. **Schema**: In `protocol/schema.json` unter `properties` einen Eintrag `"meinTyp": {"$ref":
   "#/definitions/MeinTypCall"}` anlegen und unter `definitions` `MeinTypCall` mit `request` und `response`
   sowie die Definitionen `MeinTypRequest` und `MeinTypResponse`. Die Antwort zusätzlich in
   `ServerMessage` aufnehmen. Alle Objekte mit `"additionalProperties": false`.
2. **Typen erzeugen**: `npm run generate:protocol`.
3. **Server**: In `go-server/pkg/websocket/websocket.go` den Typ im Dispatcher `handleMessage` eintragen und
   einen Handler schreiben. Einrichtungsaktionen laufen über `configure(...)`: Rechte prüfen, ausführen,
   Audit schreiben, antworten. Für Bedienaktionen `canOperate` verwenden.
4. **Fake-CCU**: Braucht die Aktion etwas Neues von der CCU (ein Skript, eine XML-RPC-Methode, eine CGI-Seite),
   in `go-server/pkg/fakeccu` nachbilden. Neue ReGa-Vorlagen erkennt die Fake-CCU automatisch an ihrem Text;
   die Antwort kommt als neuer Fall in `runScript` (`fakeccu.go`).
5. **App**: Query oder Mutation in `src/queries/index.ts`, die `request('meinTyp', …)` aufruft; die Typen
   kommen aus dem Schema.
6. **Tests**: Go-Integrationstest in `go-server/integration_test.go` (er prüft die Antwort automatisch gegen
   das Schema) und, wenn es eine sichtbare Funktion ist, ein Stack-Test in `e2e-stack/stack.spec.ts`.

## Eine Kachel für ein neues Gerät

1. Den Kanaltyp und seine Datenpunkte nachschlagen: Gerätebeschreibung in OpenCCU-Base
   (`opt/HMServer/HMIPServer.jar` → `de/eq3/cbcs/devicedescription/…` für HmIP, `firmware/rftypes/*.xml` für
   BidCos) und die Bedienung in der WebUI (`www/rega/esp/controls/*.fn`).
2. Die Kachel unter `src/controls/` bauen. Werte setzen mit `useSetDataPoint`, gemeinsame Bausteine in
   `src/components/Tile.tsx` und `Gestures.tsx`.
3. In `src/controls/registry.ts` den Kanaltyp eintragen, mit Abschnitt und `per: 'channel'` oder `'device'`.
4. Einen Kanal mit den echten Datenpunkten in den Mock (`e2e/helpers/websocketMock.ts`) aufnehmen und einen
   Test in `e2e/frontend-mocked-websocket.spec.ts` schreiben. Für neue Darstellungen die Screenshots
   erneuern.

Echte Daten liefert ein Export der eigenen CCU:

```bash
npm run export:ccu -- -o ../fixtures/meine-ccu.json -anonymize
```

Der Export liest nur (Räume, Gewerke, Kanäle mit Werten, Gerätebeschreibungen und Paramsets). `-anonymize`
ersetzt Namen von Räumen, Gewerken und Geräten. Passwörter lassen sich nicht exportieren; die Fixture
bekommt `Admin` / `secret`. Mit `go run ./cmd/fakeccu -fixture …` (in `go-server/`) läuft die eigene CCU dann
als Fake.

## Texte und Übersetzungen

Texte stehen in `messages/de.json` und `messages/en.json` (gleiche Schlüssel, der Test
`src/i18n/messages.test.ts` prüft das). Paraglide JS macht daraus typisierte Funktionen:

```tsx
import { m } from '../paraglide/messages';
<span>{m.WINDOWS_OPEN()}</span>
<span>{m.MOTION_MINUTES_AGO({ minutes: 3 })}</span>
```

Vite übersetzt beim Start und bei Änderungen selbst. Von Hand:

```bash
npx paraglide-js compile --project ./project.inlang --outdir ./src/paraglide \
  --emit-ts-declarations --strategy preferredLanguage baseLocale
```

Geschweifte Klammern in Texten sind Platzhalter, also `{name}` nur für Variablen verwenden. Die Sprache
folgt dem Browser, Rückfall ist Englisch.

## Verknüpfungsvorlagen aktualisieren

Die Profile der Direktverknüpfungen kommen aus den Easymodes der WebUI:

```bash
node scripts/import-link-profiles.mjs /pfad/zu/OpenCCU-Base
```

Das Skript liest `www/config/easymodes/<Empfänger>/<Sender>.tcl` samt Übersetzungen und schreibt
`src/controls/links/linkProfiles.json`.

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
| `AUTH_KEY_FILE`, `SESSIONS_FILE`, `AUDIT_LOG_FILE`, `PUSH_FILE`, `DIAGRAMS_FILE`, `RULES_FILE` | unter `/usr/local/etc/config` | Dateien des Add-ons |
| `DIAGRAMS_DIR` | `/usr/local/mui-diagrams` | Diagrammwerte |
| `BACKUP_DIR` | `/usr/local/tmp/mui-backups` auf der CCU, sonst `$TMPDIR/mui-backups` | Backups bis zum Download, Uploads |
| `CCU_CONFIG_DIR`, `CCU_STATUS_DIR` | `/etc/config`, `/var/status` | Konfiguration der CCU |
| `ADDONS_DIR`, `SYSLOG_CONFIG`, `LOG_DIR`, `TIME_CONF_FILE`, `NTP_CLIENT_FILE`, `TZ_FILE`, `GROUPS_FILE` | Pfade der CCU | Zusatzsoftware, Logs, Uhr, Heizgruppen |
| `DEVICE_FIRMWARE_SERVER` | `https://ccu3-update.homematic.com` | eQ-3-Updateserver für Geräte-Firmware |
| `CCU_WWW_DIR` | `/www` | Dateien der WebUI (Gerätebilder, Texte der Servicemeldungen) |
| `APP_DIR` | `/usr/local/addons/mui` | die installierte App; `assets/` liefert der Server gzip-gepackt aus |
| `USERFS_DIR`, `FIRMWARE_DOWNLOAD_FILE` | `/usr/local`, `/usr/local/tmp/firmwareUpdateFile` | Freier Speicher und Ziel des CCU-Firmware-Downloads |
| `FIRMWARE_UPLOAD_DIR`, `FIRMWARE_STAGED_LINK` | `/usr/local/tmp`, `/usr/local/.firmwareUpdate` | Hochgeladene CCU-Updates und der Link, über den die WebUI das geprüfte Update bereitstellt |
| `CCU_FIRMWARE_RELEASES` | `https://github.com/openccu/openccu/releases/download` | Releases mit SHA256-Dateien |
| `PUSH_SUBJECT` | GitHub-URL | Kontakt in Push-Anfragen |
| `DEBUG` | `false` | ausführliches Log |

Die Stack-Tests in `playwright.stack.config.ts` zeigen, wie man alle Pfade für eine Testumgebung umbiegt.

## Release

Ein Release startet mit einem Tag `vX.Y.Z`, nach demselben Schema wie in den anderen Projekten
([firsttris/workflows](https://github.com/firsttris/workflows)). Den Tag legt einer von zwei Wegen an:

- ohne Checkout: Actions → *Bump version* → patch, minor oder major (`bump.yml`). Erhöht die Version in
  `package.json` und `package-lock.json`, committet sie als `Release vX.Y.Z` auf `main`, taggt und startet
  `release.yml` auf dem Tag;
- lokal: `npm run release:patch` (oder `:minor`, `:major`), das per `postversion` Commit und Tag pusht.

`release.yml` lässt dann Build, Go- und Playwright-Tests laufen und legt die Release mit den Archiven
`mui-<version>-arm-ccu3-raspi.tar.gz` und `mui-<version>-x86_64-pc.tar.gz` an, die Notizen erzeugt GitHub aus den
Pull Requests seit der letzten Version. Lokal baut `npm run build` dieselben Archive, jeder Build in der CI
hängt sie als Artefakt `addon` an.
