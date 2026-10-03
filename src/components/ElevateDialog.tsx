import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { RequestError, useWebSocketActions } from '../hooks/useWebsocket';
import { TranslationKey, useTranslations } from '../i18n/utils';
import { m } from '../paraglide/messages';

const errorMessages: Record<string, TranslationKey> = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  CCU_UNREACHABLE: 'CCU_UNREACHABLE',
};

// Asks for the password again before settings may be changed
export const ElevateDialog = ({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) => {
  const t = useTranslations();
  const { elevate } = useWebSocketActions();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await elevate(password);
      onDone();
    } catch (e) {
      const code = e instanceof RequestError ? e.code : undefined;
      setError(t(errorMessages[code ?? ''] ?? 'INVALID_CREDENTIALS'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog title={m.ELEVATE()} confirmLabel={m.CONFIRM()} busy={busy || password === ''} onConfirm={submit} onCancel={onCancel}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== '') {
            submit();
          }
        }}
      >
        <label>
          {m.ELEVATE_HINT()}
          <input
            className="[font:inherit] w-full box-border py-2 px-[10px] mt-2 border border-solid border-border rounded-md text-foreground bg-background"
            type="password"
            aria-label={m.PASSWORD()}
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 mx-0 mb-0 text-[#c62828]">
            {error}
          </p>
        )}
      </form>
    </ConfirmDialog>
  );
};
