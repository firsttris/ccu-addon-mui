# Current State

Please note that this project is currently in an alpha stage and should be considered as a proof of concept. 
It aims to solve challenges in bridging the gap between the old and the new. 

We appreciate your understanding and patience.

# Motivation

Many Homematic user interfaces are outdated and sluggish. 

Technically, numerous web-based solutions are mired in antiquated commonJS code, entangled in the callback chaos of jQuery and Bootstrap.

Our aim is to leverage cutting-edge frontend technologies to craft a simple, yet lightning-fast, responsive web UI. This can be installed as an add-on to your CCU3, offering a seamless and dynamic user experience.

# Technology Stack

This project is built with a robust set of technologies to ensure high performance and maintainability:

- [React](https://reactjs.org/): A JavaScript library for building user interfaces.
- [TypeScript](https://www.typescriptlang.org/): A strongly typed superset of JavaScript that adds static types.
- [Material-UI](https://mui.com/): A popular React UI framework for faster and easier web development.
- [React-Query](https://react-query.tanstack.com/): A data fetching library for React, used to fetch, cache and update data in your React and React Native applications.

# Efficiency

The App uses json-rpc in a combination with Rega Script to retrieve the data from the CCU in a more effiecient manner.

For this we've refined the Rega scripts available on Github,with the assistance of GitHub Copilot, tailoring them to fetch data in the exact structure required by our application.

In addition, we've utilized [React-Query](https://react-query.tanstack.com/) from TanStack, adhering to their best practices to ensure our data requests are as efficient as possible.

# Install

To install this add-on, download the tar.gz file from the releases page. You can then install it as a plugin on your CCU3. After installation, the add-on will be available at `http://ccu3ip/addons/mui`.

# Development and Build

To develop and build this project, follow these steps:

1. Clone the repository: `git clone https://github.com/homematic-mui5.git`
2. Navigate into the project directory: `cd homematic-mui5`
3. Install the dependencies: `npm install`
4. Start the development server: `npm start` 
5. To build the project, use: `npm run build`

# Issues

Want to start contributing to this project? 

Please visit our [issues page](https://github.com/your-repo-name/issues) for the latest features and issues.

# Currently supported devices

- [Light](/apps/homematic-mui5/src/app/LightControl.tsx)
- [Thermostat](/apps/homematic-mui5/src/app/ThermostatControl.tsx)
- [Blinds](/apps/homematic-mui5/src/app/BlindsControl.tsx)

# Screenshots

## Login View
![Screenshot](/docs/Login.png)

## Rooms View
![Screenshot](/docs/Rooms.png)

## List of Devices
![Screenshot](/docs/ListOfDevices1.png)
![Screenshot](/docs/ListOfDevices2.png)