## Glossary

- **Datapoint**: A datapoint represents a specific piece of data or functionality of a device, such as a temperature reading or a switch state.
- **Channel**: A channel groups related datapoints together. For example, a device might have separate channels for different functionalities.
- **Room**: A room is a logical grouping of devices, typically representing a physical room in a building.
- **Device**: A device represents a physical device in the HomeMatic system, such as a sensor or an actuator.


## 3 System

| **Name** | **Prototype** | **Short Description** |
|----------|--------------|---------------------|
| System.Date | `string system.Date(string format)` | Queries the current time. |
| System.IsVar | `boolean system.IsVar(string name)` | Checks if a variable is defined. |
| System.GetVar | `var system.GetVar(string name)` | Determines the value of a variable. |



## 4 General Objects

| **Name** | **Prototype** | **Short Description** |
|----------|--------------|---------------------|
| GetObject | `var object.GetObject(integer id)`<br>`var object.GetObject(string name)` | Returns an object based on its ID or name. |
| ID | `integer object.ID()` | Returns the ID of an object. |
| Name | `string object.Name()` | Returns the name of an object. |
| Type | `integer object.Type()` | Returns the ID of the object type. |
| TypeName | `string object.TypeName()` | Returns the designation of the object type. |
| IsTypeOf | `boolean object.IsTypeOf(integer typeId)` | Checks if an object implements a specific type. |
| State | `var object.State()`<br>`boolean object.State(boolean newState)`<br>`boolean object.State(integer newState)`<br>`boolean object.State(real newState)`<br>`boolean object.State(time newState)`<br>`boolean object.State(string newState)` | Determines or sets the state of an object. |


## 5 Devices

| **Name** | **Prototype** | **Short Description** |
|----------|--------------|---------------------|
| Channels | `object device.Channels()` | Returns the list of channels in the device. |
| Interface | `integer device.Interface()` | Returns the ID of the interface to which the device is connected. |
| Address | `string device.Address()` | Returns the serial number of the device. |
| HssType | `string device.HssType()` | Returns the short designation of the HomeMatic device type. |

### 6 Channels

| **Name** | **Prototype** | **Short Description** |
|----------|--------------|---------------------|
| Device | `integer channel.Device()` | Returns the ID of the device in which the channel is defined. |
| DPs | `object channel.DPs()` | Returns a list of the datapoints of the channel. |
| Interface | `integer channel.Interface()` | Returns the ID of the interface to which the channel is connected. |
| Address | `string channel.Address()` | Returns the serial number of the channel. |
| ChnGroupPartnerId | `integer channel.ChnGroupPartnerId()` | Returns the ID of the partner in a channel group. |
| ChnDirection | `integer channel.ChnDirection()` | Determines the category of the channel. |
| ChnAESActive | `boolean channel.ChnAESActive()` | Determines whether the channel sends AES-encrypted. |
| ChnArchive | `boolean channel.ChnArchive()` | Determines whether the channel is logged. |
| ChnRoom | `string channel.ChnRoom()` | Determines the rooms to which the channel is assigned. |
| ChnFunction | `string channel.ChnFunction()` | Determines the trades to which the channel is assigned. |
| DPByHssDP | `object channel.DPByHssDP(string name)` | Determines a datapoint of the channel based on its name. |


## 7 Datapoints

| **Name** | **Prototype** | **Short Description** |
|----------|--------------|---------------------|
| ValueType | `integer dp.ValueType()` | Determines the data type of the value that the datapoint represents. |
| Channel | `integer dp.Channel()` | Returns the ID of the channel to which the datapoint belongs. |
| Value | `var dp.Value()` | Returns the current value of the datapoint. |
| LastValue | `var dp.LastValue()` | Returns the value of the datapoint before the last update. |
| Operations | `integer dp.Operations()` | Determines which operations can be performed on the datapoint. |
| Timestamp | `time dp.Timestamp()` | Timestamp of the last update. |