## Glossar

- **Datapunkt**: Ein Datapunkt repräsentiert ein spezifisches Datenstück oder eine Funktion eines Geräts, wie z.B. eine Temperaturmessung oder einen Schalterzustand.
- **Kanal**: Ein Kanal gruppiert verwandte Datenpunkte zusammen. Beispielsweise könnte ein Gerät separate Kanäle für verschiedene Funktionalitäten haben.
- **Raum**: Ein Raum ist eine logische Gruppierung von Geräten, die typischerweise einen physischen Raum in einem Gebäude repräsentiert.
- **Gerät**: Ein Gerät stellt ein physisches Gerät im HomeMatic-System dar, wie z.B. einen Sensor oder einen Aktuator.


## 3 System

| **Name** | **Prototyp** | **Kurzbeschreibung** |
|----------|--------------|---------------------|
| System.Date | `string system.Date(string format)` | Fragt die aktuelle Uhrzeit ab. |
| System.IsVar | `boolean system.IsVar(string name)` | Prüft, ob eine Variable definiert ist. |
| System.GetVar | `var system.GetVar(string name)` | Ermittelt den Wert einer Variable. |



## 4 Allgemeine Objekte

| **Name** | **Prototyp** | **Kurzbeschreibung** |
|----------|--------------|---------------------|
| GetObject | `var object.GetObject(integer id)`<br>`var object.GetObject(string name)` | Liefert ein Objekt anhand seiner ID bzw. seines Namens. |
| ID | `integer object.ID()` | Liefert die ID eines Objekts. |
| Name | `string object.Name()` | Liefert den Namen eines Objekts. |
| Type | `integer object.Type()` | Liefert die ID des Objekttyps. |
| TypeName | `string object.TypeName()` | Liefert die Bezeichnung des Objekttyps. |
| IsTypeOf | `boolean object.IsTypeOf(integer typeId)` | Prüft, ob ein Objekt einen speziellen Typ implementiert. |
| State | `var object.State()`<br>`boolean object.State(boolean newState)`<br>`boolean object.State(integer newState)`<br>`boolean object.State(real newState)`<br>`boolean object.State(time newState)`<br>`boolean object.State(string newState)` | Ermittelt oder setzt den Zustand eines Objekts. |


## 5 Geräte

| **Name** | **Prototyp** | **Kurzbeschreibung** |
|----------|--------------|---------------------|
| Channels | `object device.Channels()` | Liefert die Liste der Kanäle in dem Gerät. |
| Interface | `integer device.Interface()` | Liefert die ID der Schnittstelle, an der das Gerät angeschlossen ist. |
| Address | `string device.Address()` | Liefert die Seriennummer des Geräts. |
| HssType | `string device.HssType()` | Liefert die Kurzbezeichnung des HomeMatic Gerätetyps. |

### 6 Kanäle

| **Name** | **Prototyp** | **Kurzbeschreibung** |
|----------|--------------|---------------------|
| Device | `integer channel.Device()` | Liefert die ID des Geräts, in dem der Kanal definiert ist. |
| DPs | `object channel.DPs()` | Liefert eine Liste der Datenpunkte des Kanals. |
| Interface | `integer channel.Interface()` | Liefert die ID der Schnittstelle, über die der Kanal angeschlossen ist. |
| Address | `string channel.Address()` | Liefert die Seriennummer des Kanals. |
| ChnGroupPartnerId | `integer channel.ChnGroupPartnerId()` | Liefert die ID des Partners in einer Kanalgruppe. |
| ChnDirection | `integer channel.ChnDirection()` | Ermittelt die Kategorie des Kanals. |
| ChnAESActive | `boolean channel.ChnAESActive()` | Ermittelt, ob der Kanal AES-verschlüsselt sendet. |
| ChnArchive | `boolean channel.ChnArchive()` | Ermittelt, ob der Kanal protokolliert wird. |
| ChnRoom | `string channel.ChnRoom()` | Ermittelt die Räume, denen der Kanal zugeordnet ist. |
| ChnFunction | `string channel.ChnFunction()` | Ermittelt die Gewerke, denen der Kanal zugeordnet ist. |
| DPByHssDP | `object channel.DPByHssDP(string name)` | Ermittelt einen Datenpunkt des Kanals anhand seines Namens. |


## 7 Datenpunkte

| **Name** | **Prototyp** | **Kurzbezeichnung** |
|----------|--------------|---------------------|
| ValueType | `integer dp.ValueType()` | Ermittelt den Datentyp des Wertes, den der Datenpunkt repräsentiert. |
| Channel | `integer dp.Channel()` | Liefert die ID des Kanals, zu dem der Datenpunkt gehört. |
| Value | `var dp.Value()` | Liefert den aktuellen Wert des Datenpunktes. |
| LastValue | `var dp.LastValue()` | Liefert den Wert des Datenpunktes vor der letzten Aktualisierung. |
| Operations | `integer dp.Operations()` | Ermittelt, welche Operationen auf dem Datenpunkt ausgeführt werden können. |
| Timestamp | `time dp.Timestamp()` | Zeitstempel der letzten Aktualisierung. |