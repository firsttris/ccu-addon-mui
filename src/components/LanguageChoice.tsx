import { useEffect, useState } from 'react';
import { RequestError, useWebSocketActions, useWebSocketContext } from '../hooks/useWebsocket';
import { useToast } from '../contexts/ToastContext';
import { appliedLanguage, applyLanguage, type LanguageChoice as Choice } from '../i18n/language';
import { m } from '../paraglide/messages';
import { cn } from '../lib/utils';
import { errorText } from '../lib/errors';

// Whether the language is kept for the CCU user (logged in, not a guest,
// as User.setLanguage) or only on this device
const useKeptForUser = () => {
  const { authRequired, authState, userLevel } = useWebSocketContext();
  return authRequired && authState === 'authenticated' && (userLevel === 'admin' || userLevel === 'user');
};

// After the login: the user's language from the CCU, so the choice made in
// the add-on or the old WebUI follows the user to every device
export const useUserLanguageSync = () => {
  const { request } = useWebSocketActions();
  const { authRequired, authState } = useWebSocketContext();
  useEffect(() => {
    if (!authRequired || authState !== 'authenticated') return;
    request({ type: 'getUserLanguage' })
      .then((response) => {
        if (response.language !== appliedLanguage) applyLanguage(response.language);
      })
      .catch(() => undefined);
  }, [request, authRequired, authState]);
};

const choices: { value: Choice; label: () => string }[] = [
  { value: 0, label: m.LANGUAGE_AUTO },
  { value: 1, label: () => 'Deutsch' },
  { value: 2, label: () => 'English' },
];

export const LanguageChoice = () => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const keptForUser = useKeptForUser();
  const [busy, setBusy] = useState(false);

  const choose = async (value: Choice) => {
    if (value === appliedLanguage) return;
    if (keptForUser) {
      setBusy(true);
      try {
        await request({ type: 'setUserLanguage', language: value });
      } catch (error) {
        setBusy(false);
        if (!(error instanceof RequestError && error.code === 'NOT_SUPPORTED')) {
          showToast(errorText(error, m.CHANGE_FAILED));
          return;
        }
      }
    }
    applyLanguage(value);
  };

  return (
    <div className="flex flex-col gap-2 px-3 pt-3">
      <span id="language-label" className="text-[15px]">
        {m.LANGUAGE()}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="language-label"
        className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
      >
        {choices.map(({ value, label }) => (
          // biome-ignore lint/a11y/useSemanticElements: a segmented switch: buttons with role radio and aria-checked; native radios would change its look
          <button
            type="button"
            key={value}
            role="radio"
            aria-checked={appliedLanguage === value}
            disabled={busy}
            onClick={() => choose(value)}
            className={cn(
              'h-9 rounded-md text-sm font-medium transition-colors disabled:opacity-60',
              appliedLanguage === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label()}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {keptForUser ? m.LANGUAGE_HINT_USER() : m.LANGUAGE_HINT_DEVICE()}
      </span>
    </div>
  );
};
