<div align="center">

<h1>MUI: a modern WebUI for the Homematic CCU3 and OpenCCU</h1>

**The complete WebUI of your Homematic central unit, rebuilt.**<br>
Control, configure, link and program, live and on every device:
an add-on for the CCU3 and OpenCCU that replaces the old WebUI for everyday use.

[![Build](https://github.com/firsttris/ccu-addon-mui/actions/workflows/build.yml/badge.svg)](https://github.com/firsttris/ccu-addon-mui/actions/workflows/build.yml)
[![Go Tests](https://github.com/firsttris/ccu-addon-mui/actions/workflows/go-unit-tests.yml/badge.svg)](https://github.com/firsttris/ccu-addon-mui/actions/workflows/go-unit-tests.yml)
[![E2E](https://github.com/firsttris/ccu-addon-mui/actions/workflows/playwright-e2e.yml/badge.svg)](https://github.com/firsttris/ccu-addon-mui/actions/workflows/playwright-e2e.yml)
[![Release](https://img.shields.io/github/v/release/firsttris/ccu-addon-mui?label=release&color=2563eb)](https://github.com/firsttris/ccu-addon-mui/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/firsttris/ccu-addon-mui/total?color=2563eb)](https://github.com/firsttris/ccu-addon-mui/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![CCU3 | OpenCCU](https://img.shields.io/badge/central-CCU3%20%7C%20OpenCCU-1d4ed8)](docs/installation.md)

<img src="docs/screenshot-hero.png" alt="All devices on a tablet, living room and boiler room on two phones" width="900">

</div>

> The full documentation is in German: [firsttris.github.io/ccu-addon-mui](https://firsttris.github.io/ccu-addon-mui/) (source: [docs/README.md](docs/README.md)). Homematic is used mostly in
> German-speaking countries, so that is where the detail lives. The app itself speaks German and English.

MUI stands for *Modern WebUI*. The project is unrelated to the React library Material UI.
It runs wherever the CCU runs: on the CCU3 by eQ-3, on OpenCCU (formerly RaspberryMatic) on a Raspberry Pi,
x86, Proxmox or Docker, and on piVCCU, with Homematic IP (HmIP), Homematic (BidCos-RF) and Homematic IP Wired devices.

## 💡 Why?

**Bring your CCU3 into the future.**

A new interface, built for your phone. New features like push notifications and charts. And everything it
can already do stays. Everything in one app, from the light switch to the program.

- **Everything in one place**: control rooms, trades and favourites, and just as well pair devices,
  transfer settings, create direct links, write programs, make backups and install firmware.
- **Live instead of polling**: every device change reaches every open screen over WebSocket within
  milliseconds. The WebUI polls each open tab every 3 seconds.
- **Made for hand and wall**: tiles that show what is going on, gestures instead of forms, light and dark,
  installable as an app.
- **As secure as the CCU**: log in with the CCU's users and their rights, a short-lived admin token for
  settings, an audit log of every change.
- **Built after the original**: every feature follows the WebUI sources of
  [OpenCCU](https://github.com/OpenCCU/OpenCCU-Base) and uses only the CCU's own interfaces.

## ✨ Features

**What the CCU3 doesn't have**

<table>
<tr>
<td width="50%" valign="top">

### 📱 Mobile first, as an app
- Built for phone, tablet and wall, installable as an app (PWA)
- Light and dark, keep the screen on with a switch (WakeLock)
- Live over WebSocket instead of polling every 3 seconds

</td>
<td width="50%" valign="top">

### 🧩 Arrange tiles freely
- Drag & drop, per section and favourites list
- Stored in the CCU, the same on every device
- Tiles show what is going on, with gestures instead of forms

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔔 Notification rules
- “Window open for 15 minutes and cold”, “water detected”, “door opened at night”
- No program and no e-mail add-on needed
- Alarms and service messages as **push** to your phone

</td>
<td width="50%" valign="top">

### 📈 Diagrams
- Any datapoint and system variable, no microSD card
- Zoom, statistics, cost for energy meters, CSV export
- As a tile in the room

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🩺 Device health
- Battery voltage with cut-off, reception both ways
- Last message and reachability of all devices on one page
- Most urgent first

</td>
<td width="50%" valign="top">

### 🔐 Security
- See logged-in devices and log them out one by one
- Admin rights only with a fresh password, ended again with one click
- Audit log of every change with old and new value

</td>
</tr>
</table>

**Everything from the WebUI**

<table>
<tr>
<td width="50%" valign="top">

### 🏠 Operate
- Rooms, functions, favourites and *All devices* with key figures
- Own tiles for thermostat, light, blinds, lock, detectors, energy and more
- Every other device gets a tile from its device description

</td>
<td width="50%" valign="top">

### 🔥 Heating
- Thermostat with dial, boost and modes
- Week program as a timeline, copy to weekdays
- Create and change heating groups

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🛠️ Set up devices
- Pairing (HmIP with KEY/SGTIN, BidCos by serial number), inbox
- Settings with fitting controls, transfer with status
- Device pictures, function test, firmware, device replacement

</td>
<td width="50%" valign="top">

### 🔗 Direct links
- “Who controls whom” with device pictures and rooms
- 722 profiles of the WebUI, e.g. *staircase light*
- Expert mode with all parameters

</td>
</tr>
<tr>
<td width="50%" valign="top">

### ⚙️ Programs
- *If / Else if / Else* with all time controls and astro times
- System variables, virtual keys, system log
- Test scripts with syntax check and output

</td>
<td width="50%" valign="top">

### 🖥️ Manage the CCU
- Users and rights, backup and restore
- CCU firmware, add-ons, time, network, firewall, HTTPS
- SSH, security key, LAN gateways, logging

</td>
</tr>
</table>

## 📊 Status compared to the CCU3 WebUI

| | |
|---|---|
| Features of the WebUI | **97 %** (64 of 66), see [comparison](docs/vergleich-ccu3.md) |
| Device types | **all 472** on HmIP, HmIP Wired, BidCos-RF and BidCos-Wired can be controlled; 427 (90 %) have a dedicated tile for every function, 453 (96 %) for their main function |
| Automated tests | more than 600 (unit, Go, end-to-end against a fake CCU) |

Classic BidCos-Wired (HMW devices on the RS485 bus) is connected once a Wired gateway is set up, but not yet tested on real Wired hardware.

## 🚀 Installation

1. Download the matching archive from the [releases page](https://github.com/firsttris/ccu-addon-mui/releases/latest) (don't unpack it):
   - **CCU3** and OpenCCU on a **Raspberry Pi** (or another ARM board): `mui-<version>-arm-ccu3-raspi.tar.gz`
   - OpenCCU on **x86** (VM/OVA for Proxmox, VMware, VirtualBox, Synology; Docker, LXC; mini PC like an Intel NUC): `mui-<version>-x86_64-pc.tar.gz`
2. Upload and install it in the WebUI under *Settings → Control panel → Additional software*. OpenCCU starts the add-on right away; a CCU3 with eQ-3 firmware reboots for it.
3. Open **http://&lt;ccu-ip&gt;/addons/mui** and log in with a CCU user.

Later updates are installed by the app itself, without rebooting the CCU (*Setup → System → Check for update*).

## 🔧 Development

```bash
npm install
npm run dev:fake   # fake CCU + Go server + app on http://localhost:4200, login Admin / secret
```

Go server (WebSocket, XML-RPC, ReGa, JSON-RPC) · React 19 with TanStack Router and Query, Tailwind,
shadcn/ui · a JSON schema as the contract between both · Vitest, Go tests and Playwright.
See [Entwicklung](docs/entwicklung.md) and [Architektur](docs/architektur.md).

---

<div align="center">
<sub>License: <a href="LICENSE">MIT</a> · <a href="README.md">Deutsche Version</a><br>
Homematic and Homematic IP are trademarks of eQ-3 AG. This project is not affiliated with eQ-3 or OpenCCU.</sub>
</div>
