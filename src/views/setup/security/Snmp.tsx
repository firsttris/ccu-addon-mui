import { ToggleRow } from '../../../components/ToggleRow';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../../../hooks/useWebsocket';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useToast } from '../../../contexts/ToastContext';
import { usePasswordRetry } from '../usePasswordRetry';
import { m } from '../../../paraglide/messages';
import { errorText } from '../../../lib/errors';

// SNMP as cp_security.cgi's onSNMPSaveBtn: switching on needs a user and a
// password of at least 8 characters, entered twice; the CCU then runs
// setSNMPUser.sh (SNMPv3 with SHA and AES) and opens SNMP in the firewall
const SNMP_USER_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

export const Snmp = ({ current, disabled }: { current: boolean; disabled: boolean }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [on, setOn] = useState(current);
  const [user, setUser] = useState('');
  const [secret, setSecret] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();
  useEffect(() => setOn(current), [current]);
  // Switching on, or a new user or password while on
  const changing = on !== current || (on && (user !== '' || secret !== ''));
  const valid =
    !on || (SNMP_USER_PATTERN.test(user) && secret.length >= 8 && secret === repeat && !/["\\\r\n]/.test(secret));
  const save = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request(
            {
              type: 'setSnmp',
              snmp: on,
              ...(on ? { snmpUser: user, snmpPassword: secret } : {}),
              ...(pw !== undefined ? { password: pw } : {}),
            },
            { queue: false, timeoutMs: 60000 },
          );
          showToast(m.SAVED(), 'info');
          setUser('');
          setSecret('');
          setRepeat('');
          await Promise.all(['security', 'firewall'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
        } finally {
          setBusy(false);
        }
      },
      (error) => showToast(errorText(error, m.CHANGE_FAILED)),
    );
  return (
    <div className="flex flex-col gap-3">
      <ToggleRow
        id="sec-snmp"
        label={m.SEC_SNMP()}
        hint={m.SEC_SNMP_HINT()}
        checked={on}
        disabled={disabled || busy}
        onChange={setOn}
      />
      {on && (
        <div className="flex flex-wrap items-end gap-3 pl-1">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{m.SEC_SNMP_USER()}</span>
            <Input
              autoComplete="off"
              className="w-56"
              disabled={disabled || busy}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              aria-invalid={user !== '' && !SNMP_USER_PATTERN.test(user)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{m.SEC_SNMP_PASSWORD()}</span>
            <Input
              type="password"
              autoComplete="new-password"
              className="w-56"
              disabled={disabled || busy}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              aria-invalid={secret !== '' && secret.length < 8}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{m.SEC_SNMP_REPEAT()}</span>
            <Input
              type="password"
              autoComplete="new-password"
              className="w-56"
              disabled={disabled || busy}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              aria-invalid={repeat !== '' && repeat !== secret}
            />
          </label>
        </div>
      )}
      {on && <p className="text-xs text-muted-foreground">{m.SEC_SNMP_RULES()}</p>}
      {changing && (
        <>
          {password.field}
          <div className="flex justify-end">
            <Button type="button" disabled={disabled || busy || !valid || password.blocked} onClick={save}>
              {m.SEC_SNMP_SAVE()}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
