import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../../../hooks/useWebsocket';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useToast } from '../../../contexts/ToastContext';
import { m } from '../../../paraglide/messages';
import { errorText } from '../../../lib/errors';

// How long an idle WebUI session lasts (cp_security.cgi
// action_set_session_timeout: 180 to 600 s in rega.conf, taken on the next
// start of the CCU)
export const SessionTimeout = ({ current, disabled }: { current: number; disabled: boolean }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(String(current)), [current]);
  const seconds = Number(value);
  const valid = Number.isInteger(seconds) && seconds >= 180 && seconds <= 600;
  const save = async () => {
    setBusy(true);
    try {
      await request({ type: 'setSessionTimeout', seconds }, { queue: false });
      showToast(m.SEC_TIMEOUT_SAVED(), 'info');
      await queryClient.invalidateQueries({ queryKey: ['security'] });
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{m.SEC_TIMEOUT()}</h3>
      <p className="text-xs text-muted-foreground">{m.SEC_TIMEOUT_HINT()}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.SEC_TIMEOUT_SECONDS()}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={180}
            max={600}
            step={10}
            className="w-32"
            disabled={disabled || busy}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!valid}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy || !valid || seconds === current}
          onClick={save}
        >
          {m.SEC_TIMEOUT_SAVE()}
        </Button>
      </div>
      {!valid && <p className="text-xs text-destructive">{m.SEC_TIMEOUT_RANGE()}</p>}
    </div>
  );
};
