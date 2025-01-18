# CCU3 Add-on: Modern Web UI

This add-on aims to provide a modern, simple, fast, and responsive Progressive Web App (PWA) for your CCU3, by leveraging cutting-edge web technologies.

Whether you're a developer looking to contribute or a user seeking a better interface for your CCU3, 
this project has something for you. Dive in to explore the features, installation steps, and how you can get involved.

# Motivation

My motivation was to have a user-friendly app for the tablet in our kitchen, allowing us to conveniently control all devices in the house.

![Screenshot](docs/tablet-screen.jpg)

# Technology Stack

This project is built with a robust set of technologies to ensure high performance and maintainability:

- [React](https://reactjs.org/): A JavaScript library for building user interfaces.
- [TypeScript](https://www.typescriptlang.org/): A strongly typed superset of JavaScript that adds static types.
- [Emotion](https://emotion.sh/docs/introduction): A library designed for writing CSS styles with JavaScript.
- [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API): Websocket makes it possible to open a two-way interactive communication session between the user's browser and a server.

# Prerequisites for CCU3

1. **Configure Rooms and Assign Channels (Devices)**

   To ensure this add-on functions properly, you need to have rooms configured in your CCU3. Each room should have channels assigned with appropriate names, as the add-on queries the rooms, their channels, and the datapoints of those channels. Without this setup, the add-on will not work.

2. **Install Node-Red Plugin and Import Flow**

   For communication with the CCU3 over WebSocket, this add-on requires [RedMatic Node-Red](https://github.com/rdmtc/RedMatic).

# Installation

To install this add-on:
1. Install [RedMatic Node-Red](https://github.com/rdmtc/RedMatic/releases/latest).
2. Import the [Node-Red Flow](node-red-flow.json) file into Node-Red.
![Screenshot](docs/node-red-flow.png)
3. Download the latest addon `tar.gz` file from the [releases page](https://github.com/firsttris/ccu-addon-mui/releases).
4. Install it as a plugin on your CCU3 via the settings page under "Additional Software".
![Screenshot](docs/ccu3-install.png)
5. After a reboot, the add-on will be available at `http://192.168.178.111/addons/mui`. (replace with your IP).

## Setting Insecure CCU3 Origin as Secure

In the latest Chrome version, PWA and WakeLock API only work with HTTPS. You need to set up the IP of your CCU3 as a secure origin.

1. Open Chrome and go to `chrome://flags`.
2. Search for `Insecure origins treated as secure`
3. Enter IP Adress of CCU3 e.g. `http://192.168.178.111` (replace with your IP).
4. Enable
5. Save and relaunch Chrome

# Adding the PWA to Your Home Screen

Progressive Web Apps (PWAs) can be installed on your device like native apps. Follow these steps to add our PWA to your home screen:

### On Android:
1. Open the PWA in your browser (e.g., Chrome, Firefox).
2. Tap the browser's menu (usually three dots in the top right corner).
3. Select "Add to Home screen".

### On iOS:
1. Open the PWA in Safari.
2. Tap the Share button (the box with an upward arrow).
3. Scroll down and select "Add to Home Screen".

After these steps, the PWA will appear as an icon on your home screen, and you can use it just like a native app.

# Use WakeLock to Prevent Screen from Standby

To perevent the App from going into standby, we use the [WakeLock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).

Steps to enable WakeLock experimental API in Chrome:

NOTE: The WakeLock API may no longer be experimental by the time you read this.

1. Open Chrome and go to `chrome://flags`.
2. Search for and enable `Experimental Web Platform features`.
4. Save and relaunch Chrome.

After these steps, the WakeLock API should be enabled, preventing your screen from going into standby while using the PWA. 

If WakeLock is not working, check for errors in the browser console:
![Screenshot](docs/WakeLock_error.png)

# Development and Build

To develop and build this project, follow these steps:

1. Clone the repository: `git clone https://github.com/ccu-addon-mui.git`
2. Navigate into the project directory: `cd ccu-addon-mui`
3. Install the dependencies: `npm install`
4. Set your CCU3 IP in: [proxy.config.json](proxy.config.json)
5. Start the development server: `npm start`
6. To build the project, use: `npm run build`

# WebSocket Testing

To test your WebSocket connection, you can use the [WebSocket Test Client](https://chromewebstore.google.com/detail/websocket-test-client/fgponpodhbmadfljofbimhhlengambbn) Chrome Addon:

1. Open the WebSocket Test Client and go to "Options".
2. Enter your WebSocket Endpoint URL: `ws://192.168.178.111/addons/red/ws/webapp` (replace with your actual IP).
3. Press "Connect". (Status "OPEN" indicates a successful connection.)
4. Test the connection by sending the content of the [getRooms.tcl](src/rega/getRooms.tcl) script as payload.

# Issues

Want to start contributing to this project? 

Please visit our [issues page](https://github.com/firsttris/ccu-addon-mui/issues) for the latest issues and feature requests.

# Homematic API Summary

I have collected an API Summary, where you have an quick overview of all methods for the different homematic API's

[API Summary](/docs/api/README.md)

# Device Support

This project currently supports the following devices:

- [Switch](src/controls/SwitchControl.tsx)  
  ![Screenshot](docs/controls/switch.png)

- [Thermostat](src/controls/ThermostatControl.tsx)  
  ![Screenshot](docs/controls/thermostat.png)

- [Blinds](src/controls/BlindsControl.tsx)  
  ![Screenshot](docs/controls/blinds.png)

- [Door Operator](src/controls/DoorControl.tsx)  
  ![Screenshot](docs/controls/door-operator.png)

- [Floor Heating](src/controls/FloorControl.tsx)  
  ![Screenshot](docs/controls/floor-heating.png)


We welcome pull requests to add support for new devices. Your contributions are appreciated!

# User Interface Overview

The current user interface represents a responsive version of the rooms view of the CCU3.

## Rooms View

Here you see all rooms configured in the ccu3, and you can select the room in which you want to see or modify channels.

![Screenshot](/docs/Rooms.png)

## Channels View

This is the channels view.    
Here you can see and change the state of the channels associated with the selected room.

![Screenshot](/docs/channel1.png)
![Screenshot](/docs/channel2.png)
