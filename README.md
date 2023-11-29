# Current Project State

Please note that this project is currently in an alpha stage and should be considered as a proof of concept. 
It aims to solve challenges in bridging the gap between the old and the new. 

# Motivation

Web based homematic user interfaces are outdated and sluggish.

Numerous web-based solutions are mired in antiquated commonJS code, entangled in the callback chaos.

Our aim is to craft a simple, yet fast, responsive Web UI as an add-on to your CCU3.

# Technology Stack

This project is built with a robust set of technologies to ensure high performance and maintainability:

- [React](https://reactjs.org/): A JavaScript library for building user interfaces.
- [TypeScript](https://www.typescriptlang.org/): A strongly typed superset of JavaScript that adds static types.
- [Material-UI](https://mui.com/): A popular React UI framework for faster and easier web development.
- [React-Query](https://react-query.tanstack.com/): A data fetching library for React, used to fetch, cache and update data in your React and React Native applications.

# Prerequisites

For this add-on to function properly, it is necessary to have rooms configured in your CCU3. Rooms should have channels assigned with appropriate names. This is because the add-on queries the rooms, their channels, and in turn, the datapoints of those channels. Without this setup, the add-on will not work.

# Efficiency

The App uses the same JSON-RPC interface as the CCU3.

To optimize performance we've tailored [RegaScripts](/apps/ccu-addon-mui/src/rega) to fetch data in the exact structure required by our App.

In addition, we are utilizing [React-Query](https://react-query.tanstack.com/), adhering to their best practices to ensure our data requests are as efficient as possible.

# Authentication

The App provides the same authentication mechanism as the CCU3. 
After logging in, the App obtains a random session id from the CCU3, it will be saved to localStorage and used for subsequent requests. 
To prevent users from inadvertently logging each other out, it is necessary to use distinct user accounts.

# Install

To install this add-on: 
- download the latest tar.gz file from the releases page. 
- Install it as a plugin on your CCU3 on the settings page under additional software.
- After reboot, the Add-on will be available at `http://ccu3ip/addons/mui`.

*unfortunatley currently you dont see that the addon is installed under settings, see [open issues](https://github.com/firsttris/ccu-addon-mui/issues)*

# Development and Build

To develop and build this project, follow these steps:

1. Clone the repository: `git clone https://github.com/ccu-addon-mui.git`
2. Navigate into the project directory: `cd ccu-addon-mui`
3. Install the dependencies: `npm install`
4. Set your CCU3 IP in: [proxy.config.json](apps/ccu-addon-mui/proxy.config.json)
5. Start the development server: `npm start`
6. To build the project, use: `npm run build`

# Issues

Want to start contributing to this project? 

Please visit our [issues page](https://github.com/firsttris/ccu-addon-mui/issues) for the latest issues and feature requests.

# Homematic API Summary

I have collected an API Summary, where you have an quick overview of all methods for the homematic API

[API Summary](/docs/api/README.md)

# Device Support

This project currently supports the following devices:

- [Light](/apps/ccu-addon-mui/src/app/LightControl.tsx)
- [Thermostat](/apps/ccu-addon-mui/src/app/ThermostatControl.tsx)
- [Blinds](/apps/ccu-addon-mui/src/app/BlindsControl.tsx)

We welcome pull requests to add support for new devices. Your contributions are appreciated!

# User Interface Overview

The current user interface represents a responsive version of the rooms view of the CCU3.

## Login View

This is the root view. If you don't have a session ID, you'll always be redirected to this view.

![Screenshot](/docs/Login.png)

## Rooms View

Once you obtain a session ID, you'll be automatically redirected to the rooms view. Here you see all rooms configured in the ccu3, and you can select the room in which you want to see or modify channels.

![Screenshot](/docs/Rooms.png)

## Channels View

This is the channels view.    
Here you can see and change the state of the channels associated with the selected room.

![Screenshot](/docs/ListOfDevices1.png)    
![Screenshot](/docs/ListOfDevices2.png)