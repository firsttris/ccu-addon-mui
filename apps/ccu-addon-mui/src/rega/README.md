# Homematic Rega - Unofficial API Reverse Engineered by GitHub Copilot

Rega is a proprietary, object-oriented scripting language developed specifically for the HomeMatic CCU. This document provides an unofficial API documentation, detailing the methods and attributes associated with datapoints, channels, rooms, and devices in Rega.

## Glossary

- **Datapoint**: A datapoint represents a specific piece of data or functionality of a device, such as a temperature reading or a switch state.
- **Channel**: A channel groups related datapoints together. For example, a device might have separate channels for different functionalities.
- **Room**: A room is a logical grouping of devices, typically representing a physical room in a building.
- **Device**: A device represents a physical device in the HomeMatic system, such as a sensor or an actuator.

## Datapoint Methods in Rega

- `ID()`: Returns the ID of the object.
- `Name()`: Returns the name of the object.
- `TypeName()`: Returns the type of the object.
- `Value()`: Returns the value of the datapoint.
- `Timestamp()`: Returns the timestamp of the last value update.
- `Operations()`: Returns the available operations for the datapoint.
- `Unit()`: Returns the unit of the datapoint value.
- `ValueType()`: Returns the type of the datapoint value.
- `ValueList()`: Returns the list of possible values for the datapoint.

## Channel Attributes in Rega

- `ID()`: Returns the ID of the object.
- `Name()`: Returns the name of the object.
- `TypeName()`: Returns the type of the object.
- `Address()`: Returns the address of the object.
- `Interface()`: Returns the interface of the object.
- `HssType()`: Returns the Hss type of the object.
- `DPs()`: Returns the datapoints of the object.

## Room Methods in Rega

- `ID()`: Returns the ID of the object.
- `Name()`: Returns the name of the object.
- `TypeName()`: Returns the type of the object.
- `EnumUsedIDs()`: Returns a list of IDs of the subordinate objects.
- `Add(ID)`: Adds a subordinate object.
- `Remove(ID)`: Removes a subordinate object.
- `State()`: Returns the state of the object.
- `IsTypeOf(TypeName)`: Checks if the object is of the specified type.

## Device Methods in Rega

- `ID()`: Returns the ID of the object.
- `Name()`: Returns the name of the object.
- `TypeName()`: Returns the type of the object.
- `Address()`: Returns the address of the object.
- `Interface()`: Returns the interface of the object.
- `HssType()`: Returns the Hss type of the object.
- `DPs()`: Returns the datapoints of the object.