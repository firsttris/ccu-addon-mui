# XML-RPC

Die Funkdienste der CCU sprechen XML-RPC. Über sie laufen alle Funktionen, die direkt die Geräte betreffen:
Gerätebeschreibungen, Werte und Einstellungen (Paramsets), Anlernen, Direktverknüpfungen, Firmware. Und sie
melden jede Wertänderung per Callback an angemeldete Programme wie das Add-on.

## Dienste

| Dienst | Port | Pfad | Geräte |
|---|---|---|---|
| BidCos-RF (`rfd`) | 2001 | `/` | HomeMatic-Funk (HM-…) |
| HmIP-RF (`crRFD` im HMIPServer) | 2010 | `/` | HomeMatic IP und HomeMatic IP Wired |
| BidCos-Wired (`hs485d`) | 2000 | `/` | HomeMatic Wired am RS485-Bus (HMW-…), **vom Add-on nicht angebunden** |
| VirtualDevices | 9292 | `/groups` | Heizgruppen und virtuelle Geräte |

Mit eingeschalteter Authentifizierung verlangen die Dienste Basic Auth.

## Begriffe

- **Gerätebeschreibung** (`getDeviceDescription`): Typ, Firmware, Kanäle mit ihren Typen und Paramsets.
- **Paramset**: eine Gruppe von Parametern eines Geräts oder Kanals.
  - `VALUES`: die Werte zur Bedienung (z. B. `STATE`, `LEVEL`, `SET_POINT_TEMPERATURE`)
  - `MASTER`: die Einstellungen des Geräts bzw. Kanals
  - `LINK`: die Einstellungen einer Direktverknüpfung, adressiert über den Partner
- **Paramset-Beschreibung** (`getParamsetDescription`): Typ, Bereich, Standard, Einheit, Werte-Liste und Rechte
  (`operations`: lesen 1, schreiben 2, Event 4) je Parameter. Daraus baut das Add-on die generische Kachel und
  die Einstellungsseiten.

## Methoden, die das Add-on verwendet

| Bereich | Methoden |
|---|---|
| Geräte | `listDevices`, `getDeviceDescription`, `deleteDevice` |
| Werte und Einstellungen | `getParamsetDescription`, `getParamset`, `putParamset` |
| Anlernen | `setInstallMode`, `setInstallModeWithWhitelist` (HmIP mit KEY/SGTIN), `getInstallMode`, `addDevice` (BidCos per Seriennummer), `getKeyMismatchDevice`, `setTempKey` |
| Gerätetausch | `listReplaceableDevices`, `replaceDevice` (BidCos) |
| Verknüpfungen | `getLinks`, `addLink`, `removeLink`, `getParamset`/`putParamset` mit Partneradresse |
| Funk | `listBidcosInterfaces`, `setBidcosInterface` (Interface-Zuordnung, Roaming) |
| Firmware | `installFirmware` (HmIP) |
| Protokollierung | `logLevel` |
| Events | `init`, `ping` |

Werte setzt das Add-on übrigens nicht per `setValue`, sondern über ReGa, wie die WebUI.

## Events

Ein Programm meldet sich mit `init(<Callback-URL>, <Interface-ID>)` an. Ab dann ruft der Dienst diese URL selbst
per XML-RPC auf:

- `event(interfaceId, address, datapoint, value)` für jede Wertänderung, meist gebündelt in `system.multicall`
- `newDevices`, `deleteDevices`, `updateDevice` bei Änderungen an Geräten
- `listDevices`, das der Callback beantworten muss (das Add-on antwortet mit einer leeren Liste)

Abmelden geht mit `init(<Callback-URL>, "")`. `ping(interfaceId)` lässt den Dienst ein `PONG`-Event schicken; das
Add-on nutzt das, um eine eingeschlafene Anmeldung zu erkennen. Wie es Events verteilt, steht in der
[Architektur](../../architektur.md#events).

## Weiterlesen

- [Offizielle XML-RPC-Dokumentation von eQ-3](official-eq3-documentation/HM_XmlRpc_API.pdf) (PDF)
- Gerätebeschreibungen in [OpenCCU-Base](https://github.com/OpenCCU/OpenCCU-Base): `opt/HMServer/HMIPServer.jar`
  (`de/eq3/cbcs/devicedescription/`) für HmIP, `firmware/rftypes/*.xml` für BidCos-RF
- Der Client des Add-ons: `go-server/pkg/ccurpc`, der Event-Server: `go-server/pkg/xmlrpc`
