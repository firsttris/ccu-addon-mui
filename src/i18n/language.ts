import { getLocale, overwriteGetLocale } from '../paraglide/runtime';

// The language chosen per CCU user, as the WebUI keeps it (User.getLanguage,
// User.setLanguage: 0 automatic, 1 German, 2 English). It is cached on the
// device and applied here, before any text or number format is made;
// "automatic" leaves the browser's language. A change reloads the app, as
// texts are made once.
export type LanguageChoice = 0 | 1 | 2;

const KEY = 'mui-language';
const locales = { 1: 'de', 2: 'en' } as const;

export const storedLanguage = (): LanguageChoice => {
  try {
    const value = localStorage.getItem(KEY);
    return value === '1' ? 1 : value === '2' ? 2 : 0;
  } catch {
    return 0;
  }
};

// openccu-lite opens the app in its frame with its own language
// (?lang=de|en, ccu-addon-howto docs/11-openccu-lite.md "Embedding"); a
// choice made here still wins
const shellLanguage = (): 'de' | 'en' | null => {
  try {
    const lang = new URLSearchParams(window.location.search).get('lang');
    return lang === 'de' || lang === 'en' ? lang : null;
  } catch {
    return null;
  }
};

// The choice in use since the app started
export const appliedLanguage = storedLanguage();
if (appliedLanguage !== 0) {
  const locale = locales[appliedLanguage];
  overwriteGetLocale(() => locale);
} else {
  const shell = shellLanguage();
  if (shell) overwriteGetLocale(() => shell);
}
// The page's language, for screen readers, hyphenation and the browser's
// translation offer (index.html starts with "de")
document.documentElement.lang = getLocale();

// Keeps a choice on this device and reloads if it differs from the one in use
export const applyLanguage = (choice: LanguageChoice) => {
  try {
    if (choice === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(choice));
  } catch {
    // Without storage the choice holds until the app reloads
  }
  if (choice !== appliedLanguage) window.location.reload();
};
