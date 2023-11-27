1. **Datapoints-Methoden in Rega**

   - `ID()`: Die ID des Objekts.
   - `Name()`: Der Name des Objekts.
   - `TypeName()`: Der Typ des Objekts.
   - `Value()`: Der Wert des Datenpunkts.
   - `Timestamp()`: Der Zeitstempel des letzten Wertupdates.
   - `Operations()`: Die verfügbaren Operationen für den Datenpunkt.
   - `Unit()`: Die Einheit des Datenpunktwerts.
   - `ValueType()`: Der Typ des Datenpunktwerts.
   - `ValueList()`: Die Liste der möglichen Werte für den Datenpunkt.

2. **Channel-Attribute in Rega**

   - `ID()`: Die ID des Objekts.
   - `Name()`: Der Name des Objekts.
   - `TypeName()`: Der Typ des Objekts.
   - `Address()`: Die Adresse des Objekts.
   - `Interface()`: Das Interface des Objekts.
   - `HssType()`: Der Hss-Typ des Objekts.
   - `DPs()`: Die Datenpunkte des Objekts.

3. **Room-Methoden in Rega**

   - `ID()`: Gibt die ID des Objekts zurück.
   - `Name()`: Gibt den Namen des Objekts zurück.
   - `TypeName()`: Gibt den Typ des Objekts zurück.
   - `EnumUsedIDs()`: Gibt eine Liste der IDs der untergeordneten Objekte zurück.
   - `Add(ID)`: Fügt ein untergeordnetes Objekt hinzu.
   - `Remove(ID)`: Entfernt ein untergeordnetes Objekt.
   - `State()`: Gibt den Zustand des Objekts zurück.
   - `IsTypeOf(TypeName)`: Überprüft, ob das Objekt vom angegebenen Typ ist.

4. **Device-Methoden in Rega**

   - `ID()`: Gibt die ID des Objekts zurück.
   - `Name()`: Gibt den Namen des Objekts zurück.
   - `TypeName()`: Gibt den Typ des Objekts zurück.
   - `Address()`: Gibt die Adresse des Objekts zurück.
   - `Interface()`: Gibt das Interface des Objekts zurück.
   - `HssType()`: Gibt den Hss-Typ des Objekts zurück.
   - `DPs()`: Gibt die Datenpunkte des Objekts zurück.