# ccu-addon-mui: Go-Server

Der Server des Add-ons. Er läuft auf der CCU neben lighttpd, spricht mit ReGa, den Funkdiensten (XML-RPC)
und der WebUI und bedient die App über eine WebSocket-Verbindung.

Die ausführliche Doku steht in [`docs/`](../docs/README.md):

| | |
|---|---|
| [Architektur](../docs/architektur.md) | Aufbau, Pakete, Schnittstellen der CCU, Abläufe, Entscheidungen |
| [WebSocket-Protokoll](../docs/protokoll.md) | Nachrichtenhülle, Anmeldung, Events, alle 151 Nachrichtentypen, Fehlercodes |
| [Sicherheit](../docs/sicherheit.md) | Tokens, Rechte, Audit-Log |
| [Tests](../docs/tests.md) | Fake-CCU, Integrationstests, Protokoll-Vertrag |
| [Entwicklung](../docs/entwicklung.md) | Umgebungen, neue Nachricht, Umgebungsvariablen |

## Warum Go

Die erste Version des Add-ons lief auf Node.js und brachte dafür eine Laufzeit von 71 MB mit, die eine
passende GLIBC auf der CCU brauchte. Der Go-Server ist ein einziges statisches Binary:

- rund 10 MB für ARMv7, ohne Laufzeit und ohne Bibliotheken der CCU
- läuft deshalb unabhängig von der Firmware-Version
- vier Abhängigkeiten, alle einkompiliert: `gorilla/websocket`, `kolo/xmlrpc`, `rogpeppe/go-charset` und
  `golang.org/x/text` (ISO-8859-1 von ReGa und den XML-RPC-Callbacks)

## Bauen

```bash
make build          # Binary für diesen Rechner
make build-ccu3     # statisches ARMv7-Binary für die CCU (ccu-addon-mui-server-arm)
make build-addon    # dazu amd64 für OpenCCU auf x86 (…-amd64)
make size           # Größen von Binary und ARMv7-Binary
make test           # go test ./...
make coverage       # Coverage-Bericht (coverage.out, coverage.html)
```

`update_script` installiert das Binary, das zu `uname -m` passt. `build-ccu3` baut mit `GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0`, `-ldflags="-s -w -extldflags=-static"`
und `-tags netgo` (DNS ohne libc). Im Normalfall baut `npm run build` im Wurzelverzeichnis alles zusammen,
inklusive App und installierbarem `mui-<version>.tar.gz`.

## Starten

**Mit Fake-CCU**, ohne Hardware (im Wurzelverzeichnis):

```bash
npm run dev:fake   # Fake-CCU + Server + App, Anmeldung Admin / secret
```

**Gegen die eigene CCU**: `.env` aus `.env.example` anlegen, dann im Wurzelverzeichnis `npm run dev` (Server
und App) oder `npm run start:server` (nur der Server).

```bash
CCU_HOST=192.168.178.26   # Adresse der CCU
CCU_USER=Admin            # nur, falls die CCU Authentifizierung verlangt
CCU_PASS=…
CALLBACK_HOST=192.168.178.134   # Adresse DIESES Rechners, die CCU schickt Events dorthin (Port 9099)
```

Auf der CCU selbst gilt `CALLBACK_HOST=127.0.0.1` (Standard). Optionen kommen dort aus
`/usr/local/etc/config/mui.conf`, das das Startskript einliest. Alle Variablen stehen in
[Entwicklung](../docs/entwicklung.md#umgebungsvariablen).

## Nur den Server auf der CCU tauschen

```bash
make build-ccu3     # bzw. build-addon und …-amd64 für OpenCCU auf x86
ssh root@<CCU> /usr/local/etc/config/rc.d/mui stop
scp ccu-addon-mui-server-arm root@<CCU>:/usr/local/addons/mui/go-server/ccu-addon-mui-server
ssh root@<CCU> /usr/local/etc/config/rc.d/mui start
```

Das Log steht in `/var/log/mui-websocket-server.log`, mit `DEBUG=true` in `mui.conf` ausführlicher.

## Aufbau

```
main.go              Start: Konfiguration laden, Dienste verdrahten, sauber beenden
pkg/websocket        WebSocket-Server, Dispatcher, Rechte, Audit-Aufrufe, HTTP für Backup/Upload/Logs
pkg/rega             ReGa: HM-Script-Vorlagen (scripts/*.tcl, eingebettet), Parser, Validierung
pkg/ccurpc           XML-RPC-Client zu BidCos-RF, HmIP-RF, VirtualDevices, Cache für Beschreibungen
pkg/xmlrpc           XML-RPC-Server für die Events der CCU, Anmeldung und Überwachung
pkg/subscriptions    welche Verbindung welche Kanäle sieht
pkg/auth             Anmeldung über die WebUI, HMAC-Tokens, Sitzungen, Sperre
pkg/audit            Protokoll jeder Änderung
pkg/backup           Backup, Restore, CCU-Firmware, Add-ons, Werkseinstellungen, JSON-RPC-Admin-Aufrufe,
                     Heizgruppen über den HMServer
pkg/settings         Dateien in /etc/config: Netzwerk, Firewall, Zertifikat, LAN-Gateways, rega.conf …
pkg/diagrams         eigene Diagramme: Definitionen, Aufzeichnung, Abfrage
pkg/push             Web Push (RFC 8291/8292) mit der Standardbibliothek
pkg/addons           Zusatzsoftware über deren rc.d-Skripte
pkg/logs             Log-Einstellungen und Download der Logdateien
pkg/heatinggroups    groups.gson des HMServers lesen
pkg/config, logger, types
pkg/fakeccu          nachgebaute CCU (ReGa, XML-RPC, WebUI, HMServer) für Tests und Entwicklung
cmd/fakeccu          startet die Fake-CCU mit einer Fixture
cmd/ccu-export       liest eine echte CCU nur lesend aus und schreibt eine Fixture
integration_test.go  der echte Server gegen die Fake-CCU, jede Nachricht gegen protocol/schema.json
```
