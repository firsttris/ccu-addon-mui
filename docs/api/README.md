# Schnittstellen der CCU

Nachschlagewerk zu den Schnittstellen, über die das Add-on mit der Zentrale spricht. Wie das Add-on sie
einsetzt, steht in der [Architektur](../architektur.md#schnittstellen-der-ccu); das Protokoll zwischen App
und Server in [WebSocket-Protokoll](../protokoll.md).

| Schnittstelle | Wo | Wofür | Referenz |
|---|---|---|---|
| **ReGa** (HM-Script) | `POST http://<CCU>:8181/rega.exe`, auf der CCU selbst Port 8183 | Logikschicht: Räume, Gewerke, Namen, Werte, Systemvariablen, Programme, Favoriten, Benutzer, Systemprotokoll | [ReGa](Rega/README.md) |
| **XML-RPC** | BidCos-RF `:2001`, HmIP-RF `:2010`, VirtualDevices `:9292/groups` | Funkdienste: Gerätebeschreibungen, Paramsets, Anlernen, Verknüpfungen, Firmware, Events | [XML-RPC](XML-RPC/README.md) |
| **JSON-RPC** | `POST http://<CCU>/api/homematic.cgi` | API der WebUI: Anmeldung, Systemsteuerung (Firewall, SSH, Sicherheitsstufe …) | [JSON-RPC](JSON-RPC/README.md) |

Daneben ruft das Add-on einige Seiten der WebUI direkt auf, so wie die WebUI selbst: `cp_security.cgi`
(Backup, Restore, Werkseinstellungen), `cp_maintenance.cgi` (Firmware), `cp_software.cgi` (Zusatzsoftware),
`fileupload.ccc` und den HMServer unter `/pages/jpages/group/*` (Heizgruppen).

## Quellen

- **WebUI im Quelltext**: [OpenCCU-Base](https://github.com/OpenCCU/OpenCCU-Base), vor allem
  `www/webui/webui.js`, `www/rega/esp/*.fn` (Bedienung und Status in HM-Script), `www/config/*.cgi`
  (Systemsteuerung), `www/config/easymodes/` (Verknüpfungsvorlagen und Einstellungsseiten) und
  `www/api/methods.conf` (JSON-RPC). Das Add-on schlägt jede Funktion dort nach.
- **Offizielle Dokumentation von eQ-3** (PDF, in diesem Ordner):
  - [HM-Script Teil 1: Sprachbeschreibung](Rega/official-eq3-documentation/HM-Skript_Teil_1_Sprachbeschreibung_V2.2.pdf)
  - [HM-Script Teil 2: Objektmodell](Rega/official-eq3-documentation/hm_script_teil_2_objektmodell_v1.2.pdf)
  - [XML-RPC-API](XML-RPC/official-eq3-documentation/HM_XmlRpc_API.pdf)
- **Gerätebeschreibungen**: in OpenCCU-Base unter `opt/HMServer/HMIPServer.jar`
  (`de/eq3/cbcs/devicedescription/`, HmIP) und `firmware/rftypes/*.xml` (BidCos-RF).

## Beispiele

[XML-API-Beispiele](XML-API-Beispiele/) enthält Ausgaben des Add-ons *XML-API* einer echten CCU
(`devicelist.xml`, `roomlist.xml`, `statelist.xml`). Sie zeigen gut, wie Geräte, Kanäle, Datenpunkte und
ReGa-IDs zusammenhängen. Das Add-on selbst nutzt die XML-API nicht. Vollständigere Daten einer echten CCU
stehen in `fixtures/my-ccu.json` (Export mit `npm run export:ccu`).
