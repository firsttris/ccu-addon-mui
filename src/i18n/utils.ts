export const languages = {
  en: 'English',
  de: 'German',
};

export const defaultLang = (() =>
  typeof window !== 'undefined' && navigator.language.includes('de')
    ? 'de'
    : 'en')();

export const ui = {
  en: {
    SWITCH_VIRTUAL_RECEIVER: 'Switch',
    BLIND_VIRTUAL_RECEIVER: 'Blind',
    HEATING_CLIMATECONTROL_TRANSCEIVER: 'Thermostat',
    CLIMATECONTROL_FLOOR_TRANSCEIVER: 'Floor',
    //RAIN_DETECTION_TRANSMITTER: 'Rain',
    KEYMATIC: 'Keymatic',
    errorOccuredWhileLogin: 'Error occured while login',
    signInTitle: 'Sign in',
    RAINING: 'Raining',
    NOT_RAINING: 'Not Raining',
    HEATING: 'Heating',
    NOT_HEATING: 'Not Heating',
    DOOR_STATE_UNKNOWN: 'Door state is uncertain',
    SIGN_IN: 'Sign in',
    rememberMe: 'Remember me',
    LOCK: 'Lock',
    UNLOCK: 'Unlock',
    OPEN: 'Open',
  },
  de: {
    SWITCH_VIRTUAL_RECEIVER: 'Schalter',
    BLIND_VIRTUAL_RECEIVER: 'Rolladen',
    HEATING_CLIMATECONTROL_TRANSCEIVER: 'Thermostat',
    CLIMATECONTROL_FLOOR_TRANSCEIVER: 'Fußboden',
    //RAIN_DETECTION_TRANSMITTER: 'Regen',
    KEYMATIC: 'Keymatic',
    errorOccuredWhileLogin: 'Fehler beim Login',
    signInTitle: 'Anmelden',
    RAINING: 'Regen',
    NOT_RAINING: 'Kein Regen',
    HEATING: 'Heizen',
    NOT_HEATING: 'Nicht Heizen',
    DOOR_STATE_UNKNOWN: 'Türzustand ist ungewiss',
    SIGN_IN: 'Anmelden',
    rememberMe: 'Erinnere dich an mich',
    LOCK: 'Sperren',
    UNLOCK: 'Entsperren',
    OPEN: 'Öffnen',
  },
} as const;

export const useTranslations = () => {
  return (key: keyof (typeof ui)[typeof defaultLang]) => {
    return ui[defaultLang][key] || key;
  };
};
