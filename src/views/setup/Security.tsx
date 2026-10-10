import { ToggleRow } from '../../components/ToggleRow';
import { SecurityKey } from './security/SecurityKey';
import { SessionTimeout } from './security/SessionTimeout';
import { SecurityLevel } from './security/SecurityLevel';
import { Snmp } from './security/Snmp';
import { FactoryReset } from './security/FactoryReset';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { OnlyOnCCU, Panel } from './Panel';
import { usePasswordRetry } from './usePasswordRetry';
import { m } from '../../paraglide/messages';
import { errorText } from '../../lib/errors';

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

  if (userLevel !== 'admin') return null;
  if (isError) return <OnlyOnCCU title={m.SEC_TITLE()} />;
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
            {
              type: 'setSecurity',
              ssh,
              auth,
              httpsRedirect: https,
              ...(sshPassword ? { sshPassword } : {}),
              ...(pw !== undefined ? { password: pw } : {}),
            },
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
      (error) => showToast(errorText(error, m.CHANGE_FAILED)),
    );

  return (
    <Panel aria-label={m.SEC_TITLE()}>
      <h2>{m.SEC_TITLE()}</h2>
      <SecurityLevel current={data.securityLevel} disabled={!elevated} />
      <div className="flex flex-col gap-3">
        <ToggleRow
          id="sec-ssh"
          label={m.SEC_SSH()}
          hint={m.SEC_SSH_HINT()}
          checked={ssh}
          disabled={disabled}
          onChange={setSsh}
        />
        {ssh && (
          <div className="flex flex-wrap items-end gap-3 pl-1">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{m.SEC_SSH_PASSWORD()}</span>
              <Input
                type="password"
                autoComplete="new-password"
                className="w-56"
                disabled={disabled}
                value={sshPassword}
                onChange={(e) => setSshPassword(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{m.SEC_SSH_REPEAT()}</span>
              <Input
                type="password"
                autoComplete="new-password"
                className="w-56"
                disabled={disabled}
                value={sshRepeat}
                onChange={(e) => setSshRepeat(e.target.value)}
                aria-invalid={sshRepeat !== '' && sshRepeat !== sshPassword}
              />
            </label>
          </div>
        )}
        <ToggleRow
          id="sec-auth"
          label={m.SEC_AUTH()}
          hint={m.SEC_AUTH_HINT()}
          checked={auth}
          disabled={disabled}
          onChange={setAuth}
        />
        <ToggleRow
          id="sec-https"
          label={m.SEC_HTTPS()}
          hint={m.SEC_HTTPS_HINT()}
          checked={https}
          disabled={disabled}
          onChange={setHttps}
        />
      </div>
      {restarts && <p className="text-xs text-amber-700 dark:text-amber-400">{m.SEC_RESTART_HINT()}</p>}
      {password.field}
      <div className="flex justify-end">
        <Button type="button" disabled={disabled || !changed || !valid || password.blocked} onClick={save}>
          {m.SAVE()}
        </Button>
      </div>
      <SecurityKey disabled={!elevated} />
      <Snmp current={data.snmp} disabled={!elevated} />
      <SessionTimeout current={data.sessionTimeout} disabled={!elevated} />
      <FactoryReset disabled={!elevated} />
    </Panel>
  );
};
