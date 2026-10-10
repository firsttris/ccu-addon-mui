import { useState } from 'react';
import { RequestError, useWebSocketActions } from '../../../hooks/useWebsocket';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { useToast } from '../../../contexts/ToastContext';
import { usePasswordRetry } from '../usePasswordRetry';
import { m } from '../../../paraglide/messages';
import { errorText } from '../../../lib/errors';

const KEY_PATTERN = /^[0-9a-zA-Z_]{5,}$/;

// The system security key of the BidCos devices (cp_security.cgi
// action_change_key): at least 5 letters, digits or underscores, entered
// twice, with the warning to write it down
export const SecurityKey = ({ disabled }: { disabled: boolean }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const [key, setKey] = useState('');
  const [repeat, setRepeat] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();
  const valid = KEY_PATTERN.test(key) && key === repeat;

  const change = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request(
            {
              type: 'changeSecurityKey',
              key,
              ...(pw !== undefined ? { password: pw } : {}),
            },
            { queue: false, timeoutMs: 60000 },
          );
          showToast(m.SEC_KEY_SET(), 'info');
          setKey('');
          setRepeat('');
          setConfirming(false);
        } finally {
          setBusy(false);
        }
      },
      (error) => {
        const code = error instanceof RequestError ? error.code : undefined;
        showToast(
          code === 'KEY_SAME'
            ? m.SEC_KEY_SAME()
            : code === 'KEY_NOT_ALL_DEVICES'
              ? m.SEC_KEY_NOT_ALL()
              : errorText(error, m.CHANGE_FAILED),
        );
        setConfirming(false);
      },
    );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{m.SEC_KEY()}</h3>
      <p className="text-xs">{m.SEC_KEY_HINT()}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.SEC_KEY_NEW()}</span>
          <Input
            type="password"
            autoComplete="new-password"
            className="w-56"
            disabled={disabled}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            aria-invalid={key !== '' && !KEY_PATTERN.test(key)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.SEC_KEY_REPEAT()}</span>
          <Input
            type="password"
            autoComplete="new-password"
            className="w-56"
            disabled={disabled}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            aria-invalid={repeat !== '' && repeat !== key}
          />
        </label>
        <Button type="button" variant="outline" disabled={disabled || !valid} onClick={() => setConfirming(true)}>
          {m.SEC_KEY_SET_BUTTON()}
        </Button>
      </div>
      {key !== '' && !KEY_PATTERN.test(key) && <p className="text-xs text-destructive">{m.SEC_KEY_RULE()}</p>}
      {confirming && (
        <ConfirmDialog
          title={m.SEC_KEY()}
          confirmLabel={m.SEC_KEY_SET_BUTTON()}
          destructive
          busy={busy || password.blocked}
          onConfirm={change}
          onCancel={() => setConfirming(false)}
        >
          <div className="flex flex-col gap-4">
            <p>{m.SEC_KEY_WARNING()}</p>
            {password.field}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
};
