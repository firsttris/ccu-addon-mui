import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RequestError, useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { Panel } from './Panel';
import { usePasswordRetry } from './usePasswordRetry';
import { m } from '../../paraglide/messages';

const ToggleRow = ({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint: string; checked: boolean; disabled: boolean; onChange: (on: boolean) => void }) => (
  <div className="flex items-start justify-between gap-4">
    <label htmlFor={id} className="flex flex-col gap-0.5 text-sm">
      {label}
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
    <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </div>
);

export const KEY_PATTERN = /^[0-9a-zA-Z_]{5,}$/;

// The system security key of the BidCos devices (cp_security.cgi
// action_change_key): at least 5 letters, digits or underscores, entered
// twice, with the warning to write it down
const SecurityKey = ({ disabled }: { disabled: boolean }) => {
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
          await request({ type: 'changeSecurityKey', key, ...(pw !== undefined ? { password: pw } : {}) }, { queue: false, timeoutMs: 60000 });
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
        showToast(code === 'KEY_SAME' ? m.SEC_KEY_SAME() : code === 'KEY_NOT_ALL_DEVICES' ? m.SEC_KEY_NOT_ALL() : `${m.CHANGE_FAILED()}: ${error.message}`);
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
          <Input type="password" autoComplete="new-password" className="w-56" disabled={disabled} value={key} onChange={(e) => setKey(e.target.value)} aria-invalid={key !== '' && !KEY_PATTERN.test(key)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.SEC_KEY_REPEAT()}</span>
          <Input type="password" autoComplete="new-password" className="w-56" disabled={disabled} value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={repeat !== '' && repeat !== key} />
        </label>
        <Button type="button" variant="outline" disabled={disabled || !valid} onClick={() => setConfirming(true)}>
          {m.SEC_KEY_SET_BUTTON()}
        </Button>
      </div>
      {key !== '' && !KEY_PATTERN.test(key) && <p className="text-xs text-destructive">{m.SEC_KEY_RULE()}</p>}
      {confirming && (
        <ConfirmDialog title={m.SEC_KEY()} confirmLabel={m.SEC_KEY_SET_BUTTON()} destructive busy={busy || password.blocked} onConfirm={change} onCancel={() => setConfirming(false)}>
          <div className="flex flex-col gap-4">
            <p>{m.SEC_KEY_WARNING()}</p>
            {password.field}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
};

// How long an idle WebUI session lasts (cp_security.cgi
// action_set_session_timeout: 180 to 600 s in rega.conf, taken on the next
// start of the CCU)
const SessionTimeout = ({ current, disabled }: { current: number; disabled: boolean }) => {
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
      showToast(`${m.CHANGE_FAILED()}: ${(error as Error).message}`);
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
          <Input type="number" inputMode="numeric" min={180} max={600} step={10} className="w-32" disabled={disabled || busy} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={!valid} />
        </label>
        <Button type="button" variant="outline" disabled={disabled || busy || !valid || seconds === current} onClick={save}>
          {m.SEC_TIMEOUT_SAVE()}
        </Button>
      </div>
      {!valid && <p className="text-xs text-destructive">{m.SEC_TIMEOUT_RANGE()}</p>}
    </div>
  );
};

// The WebUI's security settings (Systemsteuerung → Sicherheit,
// cp_security.cgi): SSH access with a new root password, authentication
// of the remote API (it does not apply to programs on the CCU itself, as
// the add-on: auth.conf exempts 127.0.0.1), the redirect to HTTPS, and the
// system security key
export const Security = () => {
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ['security'],
    queryFn: () => request({ type: 'getSecurity' }),
    enabled: userLevel === 'admin',
    retry: false,
  });
  const [ssh, setSsh] = useState(false);
  const [sshPassword, setSshPassword] = useState('');
  const [sshRepeat, setSshRepeat] = useState('');
  const [auth, setAuth] = useState(false);
  const [https, setHttps] = useState(false);
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();

  useEffect(() => {
    if (!data) return;
    setSsh(data.ssh);
    setAuth(data.auth);
    setHttps(data.httpsRedirect);
  }, [data]);

  if (userLevel !== 'admin' || isError) return null;
  if (!data) {
    return (
      <Panel aria-label={m.SEC_TITLE()} aria-busy>
        <h2>{m.SEC_TITLE()}</h2>
        <PanelSkeleton lines={4} />
      </Panel>
    );
  }

  const changed = ssh !== data.ssh || auth !== data.auth || https !== data.httpsRedirect || sshPassword !== '';
  const restarts = auth !== data.auth || https !== data.httpsRedirect;
  const valid = sshPassword === sshRepeat && !/[\r\n]/.test(sshPassword);
  const disabled = !elevated || busy;

  const save = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request(
            { type: 'setSecurity', ssh, auth, httpsRedirect: https, ...(sshPassword ? { sshPassword } : {}), ...(pw !== undefined ? { password: pw } : {}) },
            { queue: false, timeoutMs: 60000 },
          );
          showToast(restarts ? m.SEC_SAVED_RESTART() : m.SAVED(), 'info');
          setSshPassword('');
          setSshRepeat('');
          await queryClient.invalidateQueries({ queryKey: ['security'] });
        } finally {
          setBusy(false);
        }
      },
      (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    );

  return (
    <Panel aria-label={m.SEC_TITLE()}>
      <h2>{m.SEC_TITLE()}</h2>
      <div className="flex flex-col gap-3">
        <ToggleRow id="sec-ssh" label={m.SEC_SSH()} hint={m.SEC_SSH_HINT()} checked={ssh} disabled={disabled} onChange={setSsh} />
        {ssh && (
          <div className="flex flex-wrap items-end gap-3 pl-1">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{m.SEC_SSH_PASSWORD()}</span>
              <Input type="password" autoComplete="new-password" className="w-56" disabled={disabled} value={sshPassword} onChange={(e) => setSshPassword(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{m.SEC_SSH_REPEAT()}</span>
              <Input type="password" autoComplete="new-password" className="w-56" disabled={disabled} value={sshRepeat} onChange={(e) => setSshRepeat(e.target.value)} aria-invalid={sshRepeat !== '' && sshRepeat !== sshPassword} />
            </label>
          </div>
        )}
        <ToggleRow id="sec-auth" label={m.SEC_AUTH()} hint={m.SEC_AUTH_HINT()} checked={auth} disabled={disabled} onChange={setAuth} />
        <ToggleRow id="sec-https" label={m.SEC_HTTPS()} hint={m.SEC_HTTPS_HINT()} checked={https} disabled={disabled} onChange={setHttps} />
      </div>
      {restarts && <p className="text-xs text-amber-700 dark:text-amber-400">{m.SEC_RESTART_HINT()}</p>}
      {password.field}
      <div className="flex justify-end">
        <Button type="button" disabled={disabled || !changed || !valid || password.blocked} onClick={save}>
          {m.SAVE()}
        </Button>
      </div>
      <SecurityKey disabled={!elevated} />
      <SessionTimeout current={data.sessionTimeout} disabled={!elevated} />
    </Panel>
  );
};
