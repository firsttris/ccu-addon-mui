import { getLocale } from '../paraglide/runtime';

// The language in use, e.g. for number and date formats. Apart from
// i18n/utils, whose lookup by runtime keys pulls in every text.
export const defaultLang = getLocale();
