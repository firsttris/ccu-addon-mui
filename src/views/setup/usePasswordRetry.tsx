import { useId, useState } from 'react';
import { RequestError } from '../../hooks/useWebsocket';
import { Input } from '../../components/ui/input';
import { m } from '../../paraglide/messages';

// Changes through the WebUI (heating groups, security) need a WebUI
// session: the password once, until the session expires (PASSWORD_REQUIRED)
export const usePasswordRetry = () => {
  const [needed, setNeeded] = useState(false);
  const [password, setPassword] = useState('');
  const id = useId();
  const field = needed ? (
    <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
      <label htmlFor={id}>{m.HG_PASSWORD()}</label>
      <Input id={id} type="password" autoComplete="current-password" autoFocus aria-describedby={`${id}-hint`} value={password} onChange={(e) => setPassword(e.target.value)} />
      <span id={`${id}-hint`} className="text-xs">
        {m.HG_PASSWORD_HINT()}
      </span>
    </div>
  ) : null;
  // Runs a change; asks for the password if the server needs it
  const run = async (change: (password: string | undefined) => Promise<void>, onError: (error: Error) => void) => {
    try {
      await change(needed ? password : undefined);
      setNeeded(false);
      setPassword('');
    } catch (error) {
      if (error instanceof RequestError && error.code === 'PASSWORD_REQUIRED') {
        setNeeded(true);
        return;
      }
      if (error instanceof RequestError && error.code === 'INVALID_CREDENTIALS') {
        setPassword('');
      }
      onError(error as Error);
    }
  };
  return { field, run, blocked: needed && password === '' };
};

