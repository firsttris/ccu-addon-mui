<div align="center">

<img src="docs/banner.png" alt="ccu-addon-mui: thermostat, direct link, program and push alarm" width="900">

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

> The full documentation is in German: [docs/README.md](docs/README.md). Homematic is used mostly in
> German-speaking countries, so that is where the detail lives. The app itself speaks German and English.

## 💡 Why?

The CCU3 WebUI can do everything, but it looks like 2008: tables, popups, every page rendered by the
server on each click, and values that are polled every few seconds. On a phone it is hardly usable.
This add-on replaces it with a modern app that runs on the central unit itself:

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

- **Dashboard** for rooms, trades, favourites and all devices, with dedicated tiles for thermostats, floor
  heating, lights, dimmers, colour lights, blinds, windows, locks, garage doors, detectors, sirens, climate
  and weather sensors, buttons, energy meters and access control. Every other device gets a tile built from
  its device description. Tiles can be arranged by drag and drop.
- **Alarms and service messages** live, with **push notifications** to your phone.
- **Week program editors** for thermostats and actuators, heating groups.
- **Charts** for any datapoint or system variable, without a microSD card.
- **Program editor** with all time controls and a script tester, system variables, virtual keys,
  system log.
- **Device setup**: pairing (also HmIP KEY/SGTIN), settings with proper controls and transfer status,
  direct links with the WebUI's 722 profiles, firmware updates, function test, device replacement.
- **Central unit**: users and rights, backup and restore, CCU firmware, add-ons, time and location,
  network, firewall, HTTPS certificate, SSH, security key and level, LAN gateways, logging, factory reset.

## 📊 Status compared to the CCU3 WebUI

| | |
|---|---|
| Features of the WebUI | **85 %** (56 of 66), see [comparison](docs/vergleich-ccu3.md) |
| Device types | **all 465** on HmIP, HmIP Wired and BidCos-RF can be controlled; 309 (66 %) have a dedicated tile for every function, 416 (89 %) for their main function |
| Automated tests | more than 470 (unit, Go, end-to-end against a fake CCU) |

Classic BidCos-Wired (HMW devices on the RS485 bus) is not connected yet.

## 🚀 Installation

1. Download `mui-<version>.tar.gz` from the [releases page](https://github.com/firsttris/ccu-addon-mui/releases/latest).
2. Upload and install it in the WebUI under *Settings → Control panel → Additional software*. The CCU restarts.
3. Open **http://&lt;ccu-ip&gt;/addons/mui** and log in with a CCU user.

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
