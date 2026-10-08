<div align="center">

<h1>MUI: Moderne WebUI für Homematic CCU3 und OpenCCU</h1>

**Die komplette WebUI deiner Homematic-Zentrale, neu gebaut.**<br>
Bedienen, einrichten, verknüpfen und programmieren, live und auf jedem Gerät:
ein Add-on für CCU3 und OpenCCU, das die alte WebUI im Alltag ersetzt.

[![Build](https://github.com/firsttris/ccu-addon-mui/actions/workflows/build.yml/badge.svg)](https://github.com/firsttris/ccu-addon-mui/actions/workflows/build.yml)
[![Go Tests](https://github.com/firsttris/ccu-addon-mui/actions/workflows/go-unit-tests.yml/badge.svg)](https://github.com/firsttris/ccu-addon-mui/actions/workflows/go-unit-tests.yml)
[![E2E](https://github.com/firsttris/ccu-addon-mui/actions/workflows/playwright-e2e.yml/badge.svg)](https://github.com/firsttris/ccu-addon-mui/actions/workflows/playwright-e2e.yml)
[![Release](https://img.shields.io/github/v/release/firsttris/ccu-addon-mui?label=Release&color=2563eb)](https://github.com/firsttris/ccu-addon-mui/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/firsttris/ccu-addon-mui/total?label=Downloads&color=2563eb)](https://github.com/firsttris/ccu-addon-mui/releases)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-yellow)](LICENSE)
<br>
[![CCU3 | OpenCCU](https://img.shields.io/badge/Zentrale-CCU3%20%7C%20OpenCCU-1d4ed8)](docs/installation.md)
[![HmIP | BidCos-RF | HmIP Wired](https://img.shields.io/badge/Funk-HmIP%20%7C%20BidCos--RF%20%7C%20HmIP%20Wired-1d4ed8)](docs/geraete.md)
[![Go](https://img.shields.io/badge/Go-statisches%20Binary-00add8?logo=go&logoColor=white)](docs/architektur.md)
[![React](https://img.shields.io/badge/React-19-20232a?logo=react&logoColor=61dafb)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PWA](https://img.shields.io/badge/PWA-installierbar-5a0fc8?logo=pwa&logoColor=white)](docs/installation.md#als-app-installieren)

[Warum?](#-warum) •
[Funktionen](#-funktionen) •
[Stand](#-stand-gegenüber-der-ccu3-webui) •
[Installation](#-installation) •
[Dokumentation](docs/README.md) •
[Entwicklung](#-entwicklung)

<sub>English: a modern, mobile-first web interface for the Homematic CCU3 and OpenCCU, replacing the stock WebUI. See the [English README](README.en.md).</sub>

<img src="docs/screenshot-hero.png" alt="Alle Geräte auf dem Tablet, dazu Wohnzimmer und Heizungsraum auf zwei Handys" width="900">

</div>

## 💡 Warum?

**Hol deine CCU3 in die Zukunft.**

Neue Oberfläche, gebaut fürs Handy. Neue Funktionen wie Push-Benachrichtigungen und Diagramme. Und alles,
was sie schon kann, bleibt. Alles in einer App, vom Lichtschalter bis zum Programm.

- **Alles an einem Ort**: Räume, Gewerke und Favoriten bedienen, und genauso Geräte anlernen,
  Einstellungen übertragen, Direktverknüpfungen anlegen, Programme schreiben, Backups ziehen, Firmware
  einspielen. Für den Alltag musst du die alte WebUI nicht mehr öffnen.
- **Live statt Abfrage**: Jede Änderung eines Geräts kommt über WebSocket in Millisekunden auf jedem
  offenen Gerät an. Die WebUI fragt dagegen jeden offenen Tab alle 3 Sekunden ab.
- **Für Hand und Wand gemacht**: Kacheln, die zeigen, was los ist (Lampe leuchtet, Rollladen fährt,
  Fenster steht offen), mit Gesten statt Formularen, hell oder dunkel, als App installierbar.
- **Genauso sicher wie die CCU**: Anmeldung mit den CCU-Benutzern und deren Rechten, kurzlebiges
  Admin-Token für Einstellungen, Protokoll jeder Änderung.
- **Nach dem Original gebaut**: Jede Funktion folgt den Quellen der WebUI aus
  [OpenCCU](https://github.com/OpenCCU/OpenCCU-Base). Datenpunkte, Skripte und Abläufe sind die der CCU.
  Das Add-on spricht nur deren eigene Schnittstellen und verändert nichts an der Zentrale.
- **Läuft überall, wo die CCU läuft**: auf der CCU3 von eQ-3, auf OpenCCU (früher RaspberryMatic) auf
  Raspberry Pi, x86, Proxmox oder Docker, und auf piVCCU. Mit Homematic IP (HmIP), Homematic (BidCos-RF)
  und Homematic IP Wired.

MUI steht für *Moderne WebUI*. Mit der React-Bibliothek Material UI hat das Projekt nichts zu tun.

## ✨ Funktionen

**Was es auf der CCU3 nicht gibt**

<table>
<tr>
<td width="50%" valign="top">

### 📱 Mobile first, als App
- Für Handy, Tablet und Wand gebaut, als App installierbar (PWA)
- Hell und dunkel, Bildschirm anlassen per Schalter (WakeLock)
- Live per WebSocket statt Abfrage alle 3 Sekunden

</td>
<td width="50%" valign="top">

### 🧩 Kacheln frei anordnen
- Per Drag & Drop, je Abschnitt und Favoritenliste
- Gespeichert in der CCU, auf allen Geräten gleich
- Kacheln zeigen, was los ist, mit Gesten statt Formularen

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔔 Benachrichtigungsregeln
- „Fenster seit 15 Minuten offen und kalt“, „Wasser erkannt“, „Tür nachts geöffnet“
- Ohne Programm und ohne E-Mail-Add-on
- Alarme und Servicemeldungen als **Push** aufs Handy

</td>
<td width="50%" valign="top">

### 📈 Diagramme
- Jeder Datenpunkt und jede Systemvariable, ohne microSD-Karte
- Zoom, Statistik, Kosten für Energiezähler, CSV-Export
- Als Kachel im Raum

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🩺 Geräte-Gesundheit
- Batteriespannung mit Abschaltgrenze, Empfang in beide Richtungen
- Letzte Meldung und Erreichbarkeit aller Geräte auf einer Seite
- Die dringendsten oben

</td>
<td width="50%" valign="top">

### 🔐 Sicherheit
- Angemeldete Geräte sehen und einzeln abmelden
- Admin-Rechte nur mit frischem Passwort, mit einem Klick wieder beenden
- Audit-Log jeder Änderung mit altem und neuem Wert

</td>
</tr>
</table>

**Alles aus der WebUI**

<table>
<tr>
<td width="50%" valign="top">

### 🏠 Bedienen
- Räume, Gewerke, Favoriten und *Alle Geräte* mit Kennzahlen
- Eigene Kacheln für Thermostat, Licht, Rollladen, Schloss, Melder, Energie und mehr
- Jedes andere Gerät bekommt eine Kachel aus seiner Gerätebeschreibung

</td>
<td width="50%" valign="top">

### 🔥 Heizen
- Thermostat mit Drehregler, Boost und Modi
- Wochenprogramm als Zeitleiste, Kopieren auf Werktage
- Heizgruppen anlegen und ändern

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🛠️ Geräte einrichten
- Anlernen (HmIP mit KEY/SGTIN, BidCos per Seriennummer), Posteingang
- Einstellungen mit passenden Bedienelementen, Übertragung mit Status
- Gerätebilder, Funktionstest, Firmware, Gerätetausch

</td>
<td width="50%" valign="top">

### 🔗 Direktverknüpfungen
- „Wer steuert wen“ mit Gerätebildern und Räumen
- 722 Vorlagen der WebUI, z. B. *Treppenhauslicht*
- Expertenmodus mit allen Parametern

</td>
</tr>
<tr>
<td width="50%" valign="top">

### ⚙️ Programme
- *Wenn / Sonst wenn / Sonst* mit allen Zeitsteuerungen und Astro-Zeiten
- Systemvariablen, virtuelle Taster, Systemprotokoll
- Skript testen mit Syntaxprüfung und Ausgabe

</td>
<td width="50%" valign="top">

### 🖥️ Zentrale verwalten
- Benutzer und Rechte, Backup und Wiederherstellung
- CCU-Firmware, Zusatzsoftware, Zeit, Netzwerk, Firewall, HTTPS
- SSH, Sicherheitsschlüssel, LAN-Gateways, Protokollierung

</td>
</tr>
</table>

## 📊 Stand gegenüber der CCU3-WebUI

| | Stand | |
|---|---|---|
| **Funktionen der WebUI** | **97 %** (64 von 66) | Was fehlt: [Vergleich mit der CCU3-WebUI](docs/vergleich-ccu3.md) |
| **Gerätetypen bedienbar** | **alle 472** an HmIP, HmIP Wired, BidCos-RF und BidCos-Wired | jedes Gerät, das die CCU kennt |
| … mit eigener Kachel für jede Funktion | **427** (90 %) | |
| … mit eigener Kachel für die Hauptfunktion | **453** (96 %) | Rest: [generische Kachel](docs/geraete.md#generische-kachel) |
| **Direktverknüpfungs-Vorlagen** | 722 Profile für die 7 häufigsten Empfänger | alle anderen im Expertenmodus |
| **Automatisierte Tests** | über 600 | Unit, Go, End-to-End gegen eine Fake-CCU: [Tests](docs/tests.md) |

Das klassische **BidCos-Wired** (HMW-Geräte am RS485-Bus) ist angebunden, sobald ein Wired-Gateway
eingerichtet ist, aber noch nicht an echter Wired-Hardware getestet. Gezählt wird gegen den Gerätekatalog der WebUI
(`DEVDB.tcl`, 535 Typen). Wie, steht in [Geräteunterstützung](docs/geraete.md).

## ⚡ Schnell und schlank

Die App lädt beim ersten Öffnen **400 KB statt 3,1 MB**, bekommt jede Änderung sofort per Push und kommt
danach aus dem Cache des Browsers. Dahinter läuft **ein Go-Binary mit 10 MB, das rund 15 MB RAM braucht**,
auf einer CCU3 mit 1 GB RAM, die sich das mit ReGa, den Schnittstellenprozessen und anderen Add-ons teilt.

| | CCU3-WebUI | ccu-addon-mui |
|---|---|---|
| Gerätewerte | jeder offene Tab fragt alle **3 s** ein ReGa-Skript ab (`iseRefresher`) | **Push**: die CCU meldet Änderungen per XML-RPC, der Server verteilt sie per WebSocket nur an die Geräte, die den Kanal anzeigen |
| Seitenwechsel | ReGa rendert jede Seite als HTML | App wechselt im Browser, lädt nur Daten |
| Beim Öffnen | 40 Dateien, 3,1 MB (Prototype, jQuery, Scriptaculous, jqPlot …) | 17 Dateien, 400 KB gzip-gepackt (1,3 MB entpackt), danach aus dem Cache des Service Workers |
| Server | Tcl-CGIs und ReGa | ein statisches Go-Binary ohne Laufzeit und Abhängigkeiten |

Viele Add-ons bringen eine Node.js-Laufzeit mit. Auf derselben Maschine (x86) gemessen:

| | Node.js 22, noch ohne eigenen Code | ccu-addon-mui (Go), vollständig |
|---|---|---|
| Programm | Laufzeit allein 118 MB, dazu `node_modules` | 10 MB, alles in einer Datei |
| Arbeitsspeicher | ein leerer HTTP-Server: 46 MB | 14 MB mit allen CCU-Verbindungen, 16 MB mit 10 offenen Apps |

Gemessen an den Quellen der WebUI (`rega/pages/index.htm`, `webui.js`) und am Build dieses Add-ons; der
Speicher des Servers gegen die Fake-CCU mit `fixtures/demo-ccu.json`.
Hintergründe in der [Architektur](docs/architektur.md#warum-es-schnell-ist).

## 📸 Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshot-geraet.png" alt="Geräteseite eines Wandthermostats mit Schiebereglern, Auswahlfeldern und Speichern-Leiste"><br><sub><b>Geräteeinstellungen</b>: passende Bedienelemente, Übertragung aufs Gerät</sub></td>
    <td width="50%"><img src="docs/screenshot-wochenprogramm.png" alt="Wochenprogramm eines Thermostats als Zeitleiste für jeden Tag"><br><sub><b>Wochenprogramm</b>: Zeitleiste, Kopieren auf Werktage</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshot-programm.png" alt="Programm-Editor mit Wenn-Bedingungen aus Zeit und Systemvariable"><br><sub><b>Programme</b>: Wenn, Sonst wenn, Sonst, wie in der WebUI</sub></td>
    <td width="50%"><img src="docs/screenshot-diagramme.png" alt="Diagramm mit Temperatur und Luftfeuchte über eine Woche"><br><sub><b>Diagramme</b>: jeder Datenpunkt, ohne microSD-Karte</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshot-handy-licht.png" alt="Licht, Farblicht und Fenster auf dem Handy" width="24%">
  <img src="docs/screenshot-handy-rollladen.png" alt="Rollläden auf dem Handy" width="24%">
  <img src="docs/screenshot-handy-tuer.png" alt="Türschloss mit Zieh-Geste auf dem Handy" width="24%">
  <img src="docs/screenshot-handy-sicherheit.png" alt="Melder, Sirene und Zutritt auf dem Handy" width="24%">
</p>

Mehr Bilder in [Bedienung](docs/bedienung.md) und [Einrichten](docs/einrichten.md).

## 🚀 Installation

1. Das passende Archiv von der [Releases-Seite](https://github.com/firsttris/ccu-addon-mui/releases/latest) laden (nicht entpacken):
   - **CCU3** und OpenCCU auf dem **Raspberry Pi** (oder einem anderen ARM-Board): `mui-<version>-arm-ccu3-raspi.tar.gz`
   - OpenCCU auf **x86** (VM/OVA für Proxmox, VMware, VirtualBox, Synology; Docker, LXC; Mini-PC wie Intel NUC): `mui-<version>-x86_64-pc.tar.gz`
2. In der WebUI unter *Einstellungen → Systemsteuerung → Zusatzsoftware* hochladen und installieren. OpenCCU startet das Add-on sofort, die CCU3 mit eQ-3-Firmware startet dafür neu.
3. **http://&lt;IP-der-CCU&gt;/addons/mui** öffnen und mit einem Benutzer der CCU anmelden.

Danach als App auf den Startbildschirm legen. Updates installiert die App selbst, ohne Neustart der CCU (*Einrichten → System → Auf Update prüfen*). HTTPS,
Optionen wie `AUTH_MODE` und Deinstallation stehen in der [Installation](docs/installation.md).

> [!NOTE]
> Die Einrichten-Funktionen sind neu. Alle Abläufe sind End-to-End gegen eine Fake-CCU getestet, die
> die Schnittstellen der echten Zentrale nachbildet. Ein frisches Backup vor größeren Änderungen
> schadet trotzdem nie, und Rückmeldungen von echten Installationen sind sehr willkommen.

## 📚 Dokumentation

Auch als Website mit Suche: **https://firsttris.github.io/ccu-addon-mui/**

| | |
|---|---|
| [Installation](docs/installation.md) | Installieren, Update, Anmeldung, HTTPS, als App, Push, Optionen, Deinstallation |
| [Bedienung](docs/bedienung.md) | Dashboard, Kacheln, Meldungen, Favoriten, Diagramme, Programme, Systemvariablen |
| [Einrichten](docs/einrichten.md) | Anlernen, Geräteeinstellungen, Verknüpfungen, Benutzer, Backup, Firmware, Systemsteuerung |
| [Geräteunterstützung](docs/geraete.md) | Welche Geräte welche Kachel bekommen, Zahlen, was noch fehlt |
| [Vergleich mit der CCU3-WebUI](docs/vergleich-ccu3.md) | Funktion für Funktion: vorhanden, fehlt, besser |
| [Architektur](docs/architektur.md) | Aufbau, Datenfluss, Schnittstellen der CCU, Entscheidungen |
| [API: WebSocket-Protokoll](docs/protokoll.md) | die API des Add-ons: Nachrichten, Anmeldung, Events, Fehlercodes, alle 151 Nachrichtentypen |
| [Sicherheit](docs/sicherheit.md) | Anmeldung, Tokens, Rechte, Audit-Log |
| [Tests](docs/tests.md) | Unit, Go, Fake-CCU, End-to-End, Screenshots, CI |
| [Entwicklung](docs/entwicklung.md) | Lokale Umgebung, Befehle, Protokoll erweitern, Übersetzungen, Release |

## 🔧 Entwicklung

Voraussetzungen: Node.js 22.12+ und Go 1.27+.

```bash
git clone https://github.com/firsttris/ccu-addon-mui.git && cd ccu-addon-mui
npm install
npm run dev:fake   # Fake-CCU + Go-Server + App auf http://localhost:4200, Anmeldung Admin / secret
```

Ohne echte Zentrale läuft alles gegen eine Fake-CCU mit Demo-Daten. Gegen die eigene CCU geht es mit
`npm run dev`; `npm run build` baut das installierbare Archiv.

**Stack**: Go-Server (WebSocket, XML-RPC, ReGa, JSON-RPC der WebUI) · React 19 mit TanStack Router und
Query, Tailwind und shadcn/ui · Paraglide für Deutsch und Englisch · ein JSON-Schema als Vertrag zwischen
beiden, aus dem die TypeScript-Typen entstehen · Vitest, Go-Tests und Playwright.
Mehr in [Entwicklung](docs/entwicklung.md) und [Architektur](docs/architektur.md).

## 🤝 Mitwirken

Fehler, Ideen und vor allem Rückmeldungen von echten Zentralen gern als
[Issue](https://github.com/firsttris/ccu-addon-mui/issues). Fehlt einem Gerät eine eigene Kachel, hilft ein
Export der Gerätedaten (`npm run export:ccu -- -anonymize`, siehe [Entwicklung](docs/entwicklung.md)).
Vor einem Pull Request bitte `npm test`, `npm run typecheck` und `npm run test:go` laufen lassen.

---

<div align="center">
<sub>Lizenz: <a href="LICENSE">MIT</a> · <a href="README.en.md">English version</a><br>
Homematic und Homematic IP sind Marken der eQ-3 AG. Dieses Projekt steht in keiner Verbindung zu eQ-3 oder OpenCCU.</sub>
</div>
