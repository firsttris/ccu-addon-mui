[English Version](./README.en.md)

# HomeMatic JSON-RPC 

JSON API Die HomeMatic JSON API vereinheitlicht Zugriff auf die verschiedenen Teile der HomeMatic Zentrale unter einer einheitlichen Schnittstelle. Diese Schnittstelle basiert auf JSON-RPC, einer Form des entfernen Prozeduraufrufs, der auf JSON aufsetzt. 

## Methodenübersicht

| Methodenname | Privilegstufe | Kurzbeschreibung | Parameter |
| --- | --- | --- | --- |
| BidCoS.changeLanGatewayKey | Administrator | Bereitet das Setzen eines LAN Gateway Schlüssels vor. | _session_id_ lgwclass lgwserial lgwip newkey curkey |
| BidCoS_RF.createKeyFile | Administrator | Generiert die Datei /etc/config/keys | _session_id_ key |
| BidCoS_RF.getConfigurationRF | Administrator | Liefert die aktuelle Konfiguration des BidCoS-RF Dienstes | _session_id_ |
| BidCoS_RF.isKeySet | Administrator | Ermittelt, ob ein Systemsicherheitsschlüssel im ARM7 gesetzt ist | _session_id_ |
| BidCoS_RF.setConfigurationRF | Administrator | Setzt die Konfiguration des BidCoS-RF Dienstes | _session_id_ interfaces |
| BidCoS_RF.validateKey | Administrator | Prüft, ob der angegebe Schlüssel dem System-Sicherheitsschlüssel entspricht | _session_id_ key |
| BidCoS_Wired.getConfigurationWired | Administrator | Liefert die aktuelle Konfiguration des BidCoS-Wired Dienstes | _session_id_ |
| BidCoS_Wired.setConfigurationWired | Administrator | Setzt die Konfiguration des BidCoS-Wired Dienstes | _session_id_ interfaces |
| CCU.getSSHState | Administrator | Liefert den Zustand des SSH-Zugangs der HomeMatic Zentrale (aktiviert oder deaktiviert) | _session_id_ |
| CCU.getSerial | Administrator | Liefert die Seriennummer der HomeMatic Zentrale | _session_id_ |
| CCU.getVersion | Administrator | Liefert die Firmware-Version der HomeMatic Zentrale | _session_id_ |
| CCU.restartSSHDaemon | Administrator | Restartet den SSH-Daemon | _session_id_ |
| CCU.setSSH | Administrator | Aktiviert oder. deaktiviert den SSH-Zugang der HomeMatic Zentrale | _session_id_ mode |
| CCU.setSSHPassword | Administrator | Setzt das Passwort für den SSH-Zugang | _session_id_ passwd |
| Channel.getName | Administrator | Liefert den Namen des Kanals | _session_id_ address |
| Channel.getValue | Administrator | Liefert den Wert des Kanals | _session_id_ id |
| Channel.listProgramIds | Gast | Liefert die Ids aller Programme, in denen der Kanal verwendet wird | _session_id_ id |
| Channel.pollComTest | Gast | Fragt das Ergebnis eines laufenden Funktionstests ab | _session_id_ id testId |
| Channel.setLogging | Administrator | Aktiviert bzw. deaktiviert die Protokollierung des Kanals | _session_id_ id isLogged |
| Channel.setMode | Administrator | Legt den Übertragungs-Modus (Standard oder Gesichert (AES)) des Kanals fest | _session_id_ id |
| Channel.setName | Administrator | Legt den Namen des Kanals fest | _session_id_ id |
| Channel.setUsability | Administrator | Legt fest, ob der Kanal für normale Anwender bedienbar | _session_id_ id isUsable |
| Channel.setVisibility | Administrator | Legt fest, ob der Kanal für normale Anwender sichtbar ist | _session_id_ id isVisible |
| Channel.startComTest | Gast | Startet den Funktionstest für den Kanal | _session_id_ id |
| Device.get | Gast | Liefert Detailinformationen zu einem Gerät | _session_id_ id |
| Device.getNewDeviceCount | Gast | Liefert die Anzahl aller neuen Geräte | _session_id_ |
| Device.getReGaIDByAddress | Administrator | Ermittelt die ReGa-ID eines Gerätes aufgrund der Seriennummer | _session_id_ address |
| Device.hasLinksOrPrograms | Administrator | Ermittelt, ob das Geräte in direkten Verknüpfungen oder Programmen verwendet wird | _session_id_ id |
| Device.listAll | Gast | Liefert die Ids aller fertig konfigurierten Geräte | _session_id_ |
| Device.listAllDetail | Gast | Liefert die Detailinformationen aller fertig konfigurierten Geräte | _session_id_ |
| Device.listProgramIds | Gast | Liefert die Ids aller Programme, die mindestens einen Kanal des Geräts verwenden | _session_id_ id |
| Device.pollComTest | Gast | Prüft, ob Ergebnisse für einen Funktionstest vorliegen | _session_id_ id testId |
| Device.setName | Administrator | Legt den Namen des Geräts fest | _session_id_ id name |
| Device.setOperateGroupOnly | Administrator | Legt die Bedienbarkeit des Geräts fest | _session_id_ id mode |
| Device.startComTest | Gast | Startet den Funktionstest für ein Gerät | _session_id_ id |
| Diagram.getDataSourceGroups |  | Ermittelt alle bekannten Gruppen von Datenquellen |  |
| Diagram.getDiagrams |  | Ermittelt die zur Verfügung stehenden Messwert-Diagramme |  |
| Event.poll | Gast | Fragt Ereignisse ab | _session_id_ |
| Event.subscribe | Gast | Anmeldung für Ereignisbenachrichtigungen | _session_id_ |
| Event.unsubscribe | Gast | Abmeldung für Ereignisbenachrichtigungen | _session_id_ |
| Firewall.getConfiguration | Administrator | Liefert die aktuelle Konfiguration der Firewall | _session_id_ |
| Firewall.setConfiguration | Administrator | Setzt die Konfiguration der Firewall | _session_id_ services ips |
| Interface.activateLinkParamset | Administrator | Aktiviert ein Link-Parameterset | _session_id_ interface address peerAddress longPress |
| Interface.addDevice | Administrator | Lernt ein Gerät anhand seiner Seriennummer an | _session_id_ interface serialNumber |
| Interface.addLink | Administrator | Erstellt eine direkte Verknüpfung | _session_id_ interface sender receiver name description |
| Interface.changeDevice | Administrator | Tauscht ein Gerät gegen ein anderes aus. | _session_id_ interface addressNewDevice addressOldDevice |
| Interface.changeKey | Administrator | Ändert den AES-Schlüssel | _session_id_ interface passphrase |
| Interface.clearConfigCache | Administrator | Löscht die auf der HomeMatic Zentrale gespeicherten Konfigurationsdaten für ein Gerät | _session_id_ interface address |
| Interface.deleteDevice | Administrator | Löscht ein Gerät | _session_id_ interface address flags |
| Interface.determineParameter | Administrator | Bestimmt den Wert eines Patameters | _session_id_ interface address paramsetKey parameterId |
| Interface.getDeviceDescription | Gast | Liefert die Beschreibung eines Geräts | _session_id_ interface address |
| Interface.getInstallMode | Administrator | Liefert die Restzeit, für die der Anlernmodus noch aktiv ist | _session_id_ interface |
| Interface.getKeyMissmatchDevice | Administrator | Liefert die Seriennummer des letzten Gerätes, welches nicht angelernt werden konnte | _session_id_ interface reset |
| Interface.getLGWConnectionStatus | Gast | Liefert den Verbindungsstatus des BidCoS Wired Lan Gateways | _session_id_ interface serial |
| Interface.getLGWStatus | Gast | Liefert den Status des BidCoS Wired Lan Gateways | _session_id_ interface |
| Interface.getLinkInfo | Gast | Liefert den Namen und die Beschreibung einer direkten Verknüpfung | _session_id_ interface senderAddress receiverAddress |
| Interface.getLinkPeers | Gast | Liefert alle Kommukationspartner eines Geräts | _session_id_ interface address |
| Interface.getLinks | Gast | Liefert für ein Gerät oder einen Kanal alle dirketen Verknüpfungen | _session_id_ interface address flags |
| Interface.getLogLevel | Gast | Liefert die aktuelle Stufe der Fehlerprotokollierung | _session_id_ interface |
| Interface.getMasterValue | Gast | Liefert den Wert eines Parameters aus dem Parameterset "MASTER" | _session_id_ interface address valueKey |
| Interface.getMetadata |  | Gibt ein Metadatum zu einem Object zurück | _session_id_ interface objectId dataId value |
| Interface.getParamset | Gast | Liefert ein komplettes Parameterset | _session_id_ interface address paramsetKey |
| Interface.getParamsetDescription | Gast | Liefert die Beschreibung eines Parametersets | _session_id_ interface address paramsetType |
| Interface.getParamsetId | Gast | Liefert die Id eines Parametersets | _session_id_ interface address paramsetType |
| Interface.getServiceMessageCount | Gast | Liefert die Anzahl der aktiven Servicemeldungen | _session_id_ interface |
| Interface.getValue | Gast | Liefert den Wert eines Parameters aus dem Parameterset "Values" | _session_id_ interface address valueKey |
| Interface.init | Administrator | Meldet eine Logikschicht bei einer Schnittstelle an | _session_id_ interface url interfaceId |
| Interface.isPresent |  | Prüft, ob der Dienst der betreffenden Schnittstelle läuft | interface |
| Interface.listBidcosInterfaces | Administrator | Listet die verfügbaren BidCoS-RF Interfaces auf | _session_id_ interface |
| Interface.listDevices | Gast | Liefert eine Liste aller angelernten Geräte | _session_id_ interface |
| Interface.listInterfaces | Gast | Liefert eine Liste der verfügbaren Schnittstellen | _session_id_ |
| Interface.listTeams | Gast | Liefert die Gerätebeschreibungen aller Teams | _session_id_ interface |
| Interface.putParamset | Administrator | Schreibt ein komplettes Parameterset für ein Gerät | _session_id_ interface address paramsetKey set |
| Interface.putThermParamset | Benutzer | Schreibt den Partymode für einen Thermostaten | _session_id_ interface address set |
| Interface.refreshDeployedDeviceFirmwareList | Administrator | Aktualisiert die Geraete-Firmware-Liste | _session_id_ interface |
| Interface.removeLink | Administrator | Löscht eine direkte Verknüpfung | _session_id_ interface sender receiver |
| Interface.reportValueUsage | Administrator | Teilt der Schnittstelle mit, wie häufig die Logikschicht einen Wert verwendet | _session_id_ interface address valueId refCounter |
| Interface.restoreConfigToDevice | Administrator | Überträgt alle Konfigurationsdaten erneut an ein Gerät | _session_id_ interface address |
| Interface.rssiInfo | Gast | Liefert die Empfangsfeldstärken der angeschlossenen Geräte | _session_id_ interface |
| Interface.searchDevices | Administrator | Sucht auf dem Bus nach neuen Geräte | _session_id_ interface |
| Interface.setBidcosInterface | Administrator | Ordnet ein Geräte einem BidCoS-RF Interface zu | _session_id_ interface deviceId interfaceId roaming |
| Interface.setInstallModeHMIP | Administrator | Aktiviert oder dekativiert den Anlernmodus | _session_id_ installMode interface on time address key keymode |
| Interface.setLinkInfo | Administrator | Legt den Namen und die Beschreibung einer direkten Verknüpfung fest | _session_id_ interface sender receiver name description |
| Interface.setLogLevel | Administrator | Legt die Stufe der Fehlerprotokollierung fest | _session_id_ interface level |
| Interface.setMetadata |  | Setzt ein Metadatum zu einem Object | _session_id_ interface objectId dataId value |
| Interface.setTeam | Administrator | Fügt einem Team einen Kanal hinzu | _session_id_ inteface channelAddress teamAddress |
| Interface.setTempKey | Administrator | Ändert den temporären AES-Schlüssel | _session_id_ interface passphrase |
| Interface.setValue | Gast | Setzt einen einzelnen Wert im Parameterset "Values" | _session_id_ interface address valueKey type value |
| Interface.updateFirmware | Administrator | Aktualisiert die Firmware der angegebenen Geräte | _session_id_ interface device |
| Program.deleteProgramByName | Benutzer | Löscht ein Programm mit bestimmten Namen | _session_id_ name |
| Program.execute | Benutzer | Führt ein Programm auf der HomeMatic Zentrale aus | _session_id_ id |
| Program.get | Benutzer | Liefert Detailinformationen zu einem Programm auf der HomeMatic Zentrale | _session_id_ id |
| Program.getAll | Benutzer | Liefert Detailinformationen zu allen Programmen auf der HomeMatic Zentrale | _session_id_ |
| ReGa.isPresent |  | Prüft, ob die Logikschicht (ReGa) aktiv ist |  |
| ReGa.runScript | Administrator | Führt ein HomeMatic Script aus | _session_id_ script |
| Room.addChannel | Administrator | Fügt einen Kanal zu einem Raum hinzu | _session_id_ id channelId |
| Room.get | Gast | Liefert Detailinfomationen zu einem Raum | _session_id_ id |
| Room.getAll | Gast | Liefert Detailinformationen zu allen Räumen | _session_id_ |
| Room.listAll | Gast | Liefert eine Liste aller Räume | _session_id_ |
| Room.listProgramIds | Gast | Liefert die Ids aller Programme, die mindestens einen Kanal in dem Raum verwenden | _session_id_ id |
| Room.removeChannel | Administrator | Entfernt einen Kanal aus einem Raum | _session_id_ id channelId |
| SafeMode.enter | Administrator | Startet die HomeMatic Zentrale im angesicherten Modus | _session_id_ |
| Session.login |  | Führt die Benutzeranmeldung durch | username password |
| Session.logout |  | Beendet eine Sitzung | _session_id_ |
| Session.renew | Gast | Erneuert die Sitzung; Falls eine Sitzung nicht rechtzeitig erneuert wird, läuft diese ab | _session_id_ |
| Session.setSessionVar | Gast | Setzt eine Session Variable | var val |
| Subsection.addChannel | Administrator | Fügt dem Gewerk einen Kanal hinzu | _session_id_ id channelId |
| Subsection.get | Gast | Liefert Detailinformationen zu einem Gewerk | _session_id_ id |
| Subsection.getAll | Gast | Liefert Detailinformationen zu allen Gewerken | _session_id_ |
| Subsection.listAll | Gast | Liefert eine Liste aller Gewerke | _session_id_ |
| Subsection.listProgramIds | Gast | Liefert die Ids aller Programme, die mindesten einen Kanal in dem Raum verwenden | _session_id_ id |
| Subsection.removeChannel | Administrator | Entfernt einen Kanal aus einem Gewerk | _session_id_ id channelId |
| SysVar.createBool | Benutzer | Erzeugt eine Systemvariable vom Typ bool | _session_id_ name init_val internal |
| SysVar.createFloat | Benutzer | Erzeugt eine Systemvariable vom Typ Number | _session_id_ name minValue maxValue internal |
| SysVar.deleteSysVarByName | Benutzer | Entfernt eine Systemvariable mit bestimmten Namen | _session_id_ name |
| SysVar.get | Benutzer | Liefert Detailinformationen zu einer Systemvariable auf der HomeMatic Zentrale | _session_id_ id |
| SysVar.getAll | Benutzer | Liefert Detailinformationen zu allen Systemvariablen auf der HomeMatic Zentrale | _session_id_ |
| SysVar.getValue | Benutzer | Liefert den aktuellen Wert einer Systemvariable | _session_id_ id |
| SysVar.getValueByName | Benutzer | Liefert den aktuellen Wert einer Systemvariable | _session_id_ name |
| SysVar.setBool | Benutzer | Setzt den Wert einer Systemvariable vom Type bool | _session_id_ name value |
| SysVar.setFloat | Benutzer | Setzt den Wert einer Systemvariable vom Type float | _session_id_ name value |
| User.getLanguage |  | Ermittelt die gewählte Sprache des Benutzers | userName |
| User.getUserName |  | Gibt den Username zurück | _session_id_ userID |
| User.isNoExpert |  | Ermittelt, ob ein Benutzer Experte ist | _session_id_ id |
| User.setLanguage |  | Setzt die gewählte Sprache des Benutzers | userName userLang |
| WebUI.getColors |  | Liefert die Systemfarben der HomeMatic WebUI |  |
| system.describe |  | Liefert eine detailierte Beschreibung der HomeMatic JSON API. |  |
| system.getEnergyPrice |  | Ermittelt den Preis einer KW/h |  |
| system.listMethods |  | Liefert eine Liste der verfügbaren Methoden |  |
| system.methodHelp |  | Liefert die Kurzbeschreibung einer Methode | name |
| system.saveObjectModel |  | Speichert das Object Model |  |

| Fehlercode | Kurzbeschreibung |
| --- | --- |
| 100 | Ungültige Anfrage |
| 101 | Das Element _id_ fehlt in der Anfrage |
| 102 | Das Element _method_ fehlt in der Anfrage |
| 103 | Das Element _params_ fehlt in der Anfrage |
| 200 | Ungültige Antwort |
| 201 | Das Element _id_ fehlt in der Antwort |
| 202 | Das Element _result_ fehlt in der Antwort |
| 203 | Das Element _error_ fehlt in der Antwort |
| 300 | Interner Fehler |
| 400 | Privilegstufe reicht nicht |
| 401 | Methode nicht gefunden |
| 402 | Argument nicht gefunden |
| 5xx | Anwendungsspezifische Fehler |