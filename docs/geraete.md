# Geräteunterstützung

Kurz gesagt: **Jedes Gerät, das deine CCU über HmIP, HmIP Wired, BidCos-RF oder BidCos-Wired kennt, lässt sich im
Add-on bedienen und einrichten.** Die häufigen Geräte haben dafür eigene, gestaltete Kacheln. Alle anderen
bekommen eine Kachel, die das Add-on aus der Gerätebeschreibung der CCU baut.

## Zahlen

Gezählt wird gegen den Gerätekatalog der WebUI (`www/config/devdescr/DEVDB.tcl` in
[OpenCCU-Base](https://github.com/OpenCCU/OpenCCU-Base)): 535 Gerätetypen. Welche Kanäle ein Gerätetyp hat,
steht nicht in der WebUI, sondern in den Gerätebeschreibungen, die OpenCCU mitliefert (HmIP:
`HMIPServer.jar`, BidCos: `firmware/rftypes`, `firmware/hs485types`).

| Familie | im Katalog | bedienbar | alle Kanäle mit eigener Kachel | Hauptfunktion mit eigener Kachel | nur generisch |
|---|---:|---:|---:|---:|---:|
| HomeMatic IP (Funk, inkl. ELV-SH) | 244 | 223 | 202 | 16 | 5 |
| HomeMatic IP Wired (HmIPW) | 38 | 38 | 36 | 0 | 2 |
| BidCos-RF (HM-) | 186 | 168 | 137 | 15 | 16 |
| BidCos-RF, ältere und OEM-Typen | 41 | 36 | 31 | 1 | 4 |
| BidCos-Wired (HMW-) | 15 | 11 | 6 | 0 | 5 |
| **Summe** | **524** | **476** | **412 (87 %)** | **32 (7 %)** | **32 (7 %)** |
| virtuelle Typen (VIR-) | 11 | nicht geprüft | | | |

- **BidCos-Wired** ist angebunden, sobald ein Wired-Gateway (HMW-LGW) eingerichtet ist, aber noch nicht an
  echter Wired-Hardware getestet.
- **bedienbar**: Gerätetypen mit Beschreibung und mindestens einem Kanal mit Werten. Nicht mitgezählt sind
  Access Points, Repeater und Funkmodule ohne bedienbaren Kanal sowie Typen, zu denen OpenCCU keine
  Beschreibung mitliefert (z. B. die -644-Dimmer und WS550).
- **alle Kanäle mit eigener Kachel**: Jeder sichtbare Kanal des Geräts hat eine gestaltete Kachel.
- **Hauptfunktion mit eigener Kachel**: Der Hauptkanal ist gestaltet, ein Nebenkanal generisch, z. B. das
  Display eines Wandthermostats.
- **nur generisch**: kein Kanal hat eine eigene Kachel. Das Gerät ist trotzdem voll bedienbar.

Zusammen haben **444 von 476 Gerätetypen (93 %)** eine eigene Kachel für ihre Hauptfunktion.

Die Zählung ist reproduzierbar. Die Skripte vergleichen die Gerätebeschreibungen mit
`src/controls/registry.ts`, gegengeprüft an einem Export einer echten CCU (`fixtures/my-ccu.json`).
Mehrere Firmware-Versionen eines Typs werden zusammengefasst. „Eigene Kachel“ heißt, dass es eine
gestaltete Kachel gibt, nicht, dass sie jede Funktion des Geräts abdeckt.

## Eigene Kacheln

Welche Kachel ein Kanal bekommt, entscheidet sein Kanaltyp (`src/controls/registry.ts`):

| Kachel | Kanaltypen | Beispiele |
|---|---|---|
| Thermostat | `HEATING_CLIMATECONTROL_TRANSCEIVER`, `CLIMATECONTROL_RT_TRANSCEIVER`, `THERMALCONTROL_TRANSMIT` | HmIP-eTRV, -WTH, -STHD, -BWTH, HmIPW-STHD, HM-CC-RT-DN, HM-TC-IT-WM-W-EU |
| Fußbodenheizung | `CLIMATECONTROL_FLOOR_TRANSCEIVER` | HmIP-FALMOT-C12, HmIPW-FALMOT-C12 |
| Licht und Schalter | `SWITCH_VIRTUAL_RECEIVER`, `SWITCH` | HmIP-PS, -PSM, -BSM, -FSM, -FS6, HmIPW-DRS8, HM-LC-Sw1-FM |
| Dimmer | `DIMMER_VIRTUAL_RECEIVER`, `DIMMER` | HmIP-PDT, -BDT, -WUA, HmIPW-DRD3, HM-LC-Dim1T |
| Farblicht | `UNIVERSAL_LIGHT_RECEIVER` | HmIP-RGBW, -LSC, -DRG-DALI |
| Rollladen und Jalousie | `BLIND_VIRTUAL_RECEIVER`, `SHUTTER_VIRTUAL_RECEIVER`, `BLIND`, `JALOUSIE` | HmIP-BROLL, -FROLL, -BBL, -FBL, HmIPW-DRBL4, HM-LC-Bl1-FM, HM-LC-Ja1PBU-FM |
| Fenster | `SHUTTER_CONTACT`, `ROTARY_HANDLE_SENSOR`, `ROTARY_HANDLE_TRANSCEIVER` | HmIP-SWDO, -SCI, -SRH, HM-Sec-SCo, HM-Sec-RHS |
| Fensterantrieb | `WINDOW_DRIVE_RECEIVER`: öffnen, schließen, Stopp; `WINMATIC` zusätzlich verriegeln, `AKKU` mit Ladezustand | HmIP-MOD-WD-VK, HM-Sec-Win |
| Türschloss | `KEYMATIC`, `DOOR_LOCK_TRANSCEIVER`, `DOOR_LOCK_STATE_TRANSMITTER` | HM-Sec-Key, HmIP-DLD |
| Garagentor | `DOOR_RECEIVER` | HmIP-MOD-HO, -MOD-TM |
| Rauchmelder | `SMOKE_DETECTOR` | HmIP-SWSD, HM-Sec-SD-2 |
| Bewegung und Präsenz | `MOTION_DETECTOR`, `MOTIONDETECTOR_TRANSCEIVER`, `MOTIONDETECTOR_VIRTUAL_TRANSCEIVER`, `PRESENCEDETECTOR_TRANSCEIVER` | HmIP-SMI, -SMO, -SPI, HmIPW-SMI55, HM-Sen-MDIR-O |
| Wassermelder | `WATER_DETECTION_TRANSMITTER`, `WATERDETECTIONSENSOR` | HmIP-SWD, HM-Sec-WDS |
| Sirene | `ALARM_SWITCH_VIRTUAL_RECEIVER` | HmIP-ASIR, -ASIR-2, -ASIR-O |
| Zutritt | `ACCESS_TRANSCEIVER` (eine Kachel je Gerät) | HmIP-WKP, -FWI |
| Klima und Wetter | `CLIMATE_TRANSCEIVER`, `WEATHER_TRANSMIT`, `WEATHER` | HmIP-STHO, -SWO, HM-WDS10-TH-O, HM-WDS100 |
| Regen | `RAIN_DETECTION_TRANSMITTER`: Regen, Heizung, Temperatur | HmIP-SRD |
| Helligkeit | `BRIGHTNESS_TRANSMITTER`, `LUXMETER`: aktuell, Durchschnitt, Minimum, Maximum | HmIP-SLO, HM-Sen-LI-O |
| CO₂ | `CARBON_DIOXIDE_RECEIVER` (ppm, bewertet nach Umweltbundesamt), `SENSOR_FOR_CARBON_DIOXIDE` (Stufe) | HmIP-SCTH230, HM-CC-SCD |
| Feinstaub | `TEMP_HUMIDITY_PARTICULATE_MATTER_TRANSMITTER`: PM2.5 (bewertet nach dem Europäischen Luftqualitätsindex), PM10, Partikelgröße, Temperatur, Luftfeuchte | HmIP-SFD |
| Bodenfeuchte | `SOIL_MOISTURE_TRANSMITTER`: Feuchte, Bodentemperatur | ELV-SH-SMSI |
| Erschütterung und Neigung | `ACCELERATION_TRANSCEIVER`, je nach Betriebsart Erschütterung, Lage oder Neigung | HmIP-SAM, -STV, ELV-SH-CTV, -TACO |
| Netzausfall | `POWER_MAINS_TRANSMITTER` | HmIP-PMFS |
| Bewässerung | `WATER_SWITCH_VIRTUAL_RECEIVER`: Ventil auf und zu, mit `ON_TIME` auch für 10, 30 oder 60 Minuten; `FLOW_METER_TRANSMITTER`: Durchfluss, Menge seit dem Öffnen, Gesamtmenge | HmIP-WSM, ELV-SH-WSM |
| Wasserschutz | `VALVE_ACTUATOR_RECEIVER` (Absperrventil), `WATER_FLOW_TRANSMITTER`, `WATER_PRESSURE_TRANSMITTER` | HmIP-WSS |
| Taster | `KEY_TRANSCEIVER`, `KEY`, `VIRTUAL_KEY` (eine Kachel je Gerät) | HmIP-WRC2, -WRC6, -BRC2, HM-PB-2-WM55, Fernbedienungen |
| Eingang | `MULTI_MODE_INPUT_TRANSMITTER`, je nach Betriebsart Taster, Schalter, Kontakt oder Level | HmIP-FCI1, -FCI6, -DSD-PCB, die Eingänge von HmIP-BSL, -DRSI4, HmIPW-DRI16 |
| Energiezähler | `ENERGIE_METER_TRANSMITTER`, `POWERMETER` (eine Kachel je Gerät) | HmIP-ESI, HmIP-PSM, HM-ES-PMSw1 |
| Access Point / Bus | `ACCESSPOINT_GENERIC_RECEIVER` (eine Kachel je Gerät) | HmIPW-DRAP |

Eingänge zeigen, wofür sie in den Einstellungen eingerichtet sind (Betriebsart): Tastendrücke leuchten auf,
ein Kontakt zeigt offen oder geschlossen, ein Level seinen Wert. Die Betriebsart merkt sich die CCU wie
bei der WebUI als Metadatum `channelMode`; das Add-on setzt es beim Speichern der Einstellungen mit.
Bedienen lassen sich Eingänge nicht, auch die WebUI hat dafür kein Bedienelement.

Nicht jeder Kanal erscheint als Kachel. Ausgeblendet werden Wartungskanäle (Batterie, Erreichbarkeit
stehen an der Kachel selbst), Kanäle ohne Werte, die Rohwerte von Wochenprogrammen und bei HmIP die
Statuskanäle (`*_TRANSMITTER`) neben ihrem virtuellen Empfänger.

## Generische Kachel

Alles ohne eigene Kachel rendert `GenericControl` aus der Beschreibung der Werte (`VALUES`-Paramset), die
die CCU für jeden Kanal liefert:

| Parametertyp | Element |
|---|---|
| Ein/Aus (`BOOL`) | Schalter, oder Anzeige, wenn nur lesbar |
| Aktion (`ACTION`) | Knopf |
| Werte-Liste (`ENUM`) | Auswahl |
| Zahl (`FLOAT`, `INTEGER`) | Eingabefeld mit Einheit und Grenzen, Prozent als 0–100 % |
| Sonderwerte (z. B. „nicht verwendet“) | als Text |

Die generische Kachel hat einen Link *In alter WebUI öffnen*, falls ein Gerät dort mehr kann.
Gleiches gilt für die Einstellungen (`MASTER`-Paramset): Die bekommt **jedes** Gerät der drei
angebundenen Schnittstellen, mit passenden Bedienelementen (siehe [Einrichten](einrichten.md#die-geräteseite)).

## Was noch fehlt

Nach Bedeutung:

1. **Display-Geräte**: HmIP-WGD, HmIPW-WGD und das Display des HmIP-WRCD haben keinen Baukasten für Texte und
   Symbole; die Werte sind nur generisch bedienbar.
2. **Weitere Sensoren**: Abstand, Durchgang (HmIP-SPDR), Füllstand, Zählersensoren (HM-ES-TX-WM).
3. **Verknüpfungsvorlagen** gibt es für die 7 häufigsten Empfänger (Schalt-, Dimm- und Rollladenaktoren, 722
   Profile). Für die übrigen 59 Empfängertypen der WebUI (2065 Profile) geht nur der Expertenmodus mit allen
   Parametern.
4. **Gerätebilder** der WebUI zeigt das Add-on nicht.

## Ein Gerät fehlt oder sieht falsch aus?

Am meisten hilft ein Export der Gerätedaten deiner CCU:

```bash
npm run export:ccu -- -o ../fixtures/meine-ccu.json -anonymize
```

Der Export liest nur (Räume, Kanäle, Gerätebeschreibungen) und ersetzt Namen durch Platzhalter.
Mit der Datei lässt sich das Gerät gegen die Fake-CCU nachbauen und eine Kachel dafür entwickeln, siehe
[Entwicklung](entwicklung.md#eine-kachel-für-ein-neues-gerät). Gegen alle Fixtures läuft außerdem ein Test,
der jede Gerätebeschreibung durch die generische Kachel schickt.
