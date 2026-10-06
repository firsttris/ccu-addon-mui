import { m } from '../paraglide/messages';

// Texts live in messages/<locale>.json and are compiled by Paraglide JS
// into typed functions: use m.KEY() for fixed texts. A missing translation
// fails the build.

export type TranslationKey = keyof typeof m;

// The language in use (i18n/locale; imported from there where no lookup by
// runtime keys is needed)
export { defaultLang } from './locale';

const messages = m as unknown as Record<string, (() => string) | undefined>;

// Looks up a text by a key known only at runtime (channel types, parameter
// names, error codes); returns the key itself if there is no text for it.
const translate = (key: TranslationKey | string): string => messages[key]?.() ?? key;

// Returns the same function on every call, so it can be used in hook
// dependencies without causing re-renders.
export const useTranslations = () => translate;
