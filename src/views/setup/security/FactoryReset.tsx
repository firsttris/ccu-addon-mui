import { useState } from 'react';
import { RequestError, useWebSocketActions } from '../../../hooks/useWebsocket';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { useToast } from '../../../contexts/ToastContext';
import { usePasswordRetry } from '../usePasswordRetry';
import { m } from '../../../paraglide/messages';
import { errorText } from '../../../lib/errors';

// The word to type before the reset, so it can't happen by a slip
const RESET_WORD = 'ZURÜCKSETZEN';

// Resetting the CCU to factory settings (cp_security.cgi system reset):
// all devices, programs and settings go, and add-ons with them, this one
// too. A set system security key must be entered; the word typed confirms.
export const FactoryReset = ({ disabled }: { disabled: boolean }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [key, setKey] = useState('');
  const [needsKey, setNeedsKey] = useState(false);
  const [keyWrong, setKeyWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const password = usePasswordRetry();
  const close = () => {
    setOpen(false);
    setWord('');
    setKey('');
    setKeyWrong(false);
  };
  const reset = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request(
            {
              type: 'factoryReset',
              ...(key ? { key } : {}),
              ...(pw !== undefined ? { password: pw } : {}),
            },
            { queue: false, timeoutMs: 60000 },
          );
          close();
          setStarted(true);
        } finally {
          setBusy(false);
        }
      },
      (error) => {
        const code = error instanceof RequestError ? error.code : undefined;
        if (code === 'KEY_REQUIRED') setNeedsKey(true);
        else if (code === 'KEY_WRONG') setKeyWrong(true);
        else showToast(errorText(error, m.CHANGE_FAILED));
      },
    );
  if (started) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
        {m.RESET_STARTED()}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-3">
      <h3 className="text-sm font-medium text-destructive">{m.RESET_TITLE()}</h3>
      <p className="text-xs text-muted-foreground">{m.RESET_HINT()}</p>
      <Button
        type="button"
        variant="outline"
        className="w-fit text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {m.RESET_BUTTON()}
      </Button>
      {open && (
        <ConfirmDialog
          title={m.RESET_TITLE()}
          confirmLabel={m.RESET_BUTTON()}
          destructive
          busy={busy || word !== RESET_WORD || (needsKey && key === '') || password.blocked}
          onConfirm={reset}
          onCancel={close}
        >
          <div className="flex flex-col gap-3">
            <p>{m.RESET_WARNING()}</p>
            <ul className="list-disc pl-5 text-sm">
              <li>{m.RESET_WARNING_DEVICES()}</li>
              <li>{m.RESET_WARNING_ADDON()}</li>
            </ul>
            <p className="font-medium">{m.RESET_WARNING_BACKUP()}</p>
            {needsKey && (
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{m.RESET_KEY()}</span>
                <Input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    setKeyWrong(false);
                  }}
                  aria-invalid={keyWrong}
                />
                {keyWrong && <span className="text-xs text-destructive">{m.RESET_KEY_WRONG()}</span>}
              </label>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{m.RESET_TYPE({ word: RESET_WORD })}</span>
              <Input autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />
            </label>
            {password.field}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
};
