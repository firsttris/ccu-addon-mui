import { m } from '../paraglide/messages';

// The rooms and trades the CCU creates on first start are named by a key
// of the WebUI's texts, e.g. "roomGarden" or "funcLight" (OpenCCU-Base
// bin/hm_startup), and the WebUI shows them translated
// (translateKey, webui/js/lang/*/translate.lang.extension.js). A table
// rather than m[key], as in channelTypeNames. Names given by the user
// stay as they are.
const names: Record<string, () => string> = {
  roomLivingRoom: m.GROUP_ROOM_LIVING_ROOM,
  roomKitchen: m.GROUP_ROOM_KITCHEN,
  roomBedroom: m.GROUP_ROOM_BEDROOM,
  roomChildrensRoom1: m.GROUP_ROOM_CHILDRENS_ROOM_1,
  roomChildrensRoom2: m.GROUP_ROOM_CHILDRENS_ROOM_2,
  roomOffice: m.GROUP_ROOM_OFFICE,
  roomBathroom: m.GROUP_ROOM_BATHROOM,
  roomGarage: m.GROUP_ROOM_GARAGE,
  roomHWR: m.GROUP_ROOM_HWR,
  roomGarden: m.GROUP_ROOM_GARDEN,
  roomTerrace: m.GROUP_ROOM_TERRACE,
  funcLight: m.GROUP_FUNC_LIGHT,
  funcHeating: m.GROUP_FUNC_HEATING,
  funcClimateControl: m.GROUP_FUNC_CLIMATE_CONTROL,
  funcWeather: m.GROUP_FUNC_WEATHER,
  funcEnvironment: m.GROUP_FUNC_ENVIRONMENT,
  funcSecurity: m.GROUP_FUNC_SECURITY,
  funcLock: m.GROUP_FUNC_LOCK,
  funcButton: m.GROUP_FUNC_BUTTON,
  funcCentral: m.GROUP_FUNC_CENTRAL,
  funcEnergy: m.GROUP_FUNC_ENERGY,
};

// Object.hasOwn: a name like "toString" is a name, not a key
export const groupName = (name: string) => (Object.hasOwn(names, name) ? names[name]() : name);

// The same for a list of rooms or trades
export const withGroupNames = <T extends { name: string }>(groups: T[]) =>
  groups.map((group) => ({ ...group, name: groupName(group.name) }));
