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
import type { Firewall as FirewallConfig, FirewallService } from '../../types/protocol';
import { errorText } from '../../lib/errors';

type Access = FirewallService['access'];

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:]*:[0-9a-fA-F:.]*$/;

// An address or network as FirewallConfigDialog takes it: "1.2.3.4",
// "1.2.3.0/8" and IPv6 as libfirewall.tcl does
export const validFirewallAddress = (text: string) => {
  const [ip, prefix, ...rest] = text.split('/');
  if (rest.length) return false;
  const v4 = IPV4.test(ip);
  if (!v4 && !(IPV6.test(ip) && (ip.match(/::/g) ?? []).length <= 1)) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (v4 ? 32 : 128);
};

export const validPort = (text: string) => /^\d{1,5}$/.test(text) && Number(text) >= 1 && Number(text) <= 65535;

// The WebUI's text fields: entries separated by ';' (webui.js
// FirewallConfigDialog: replace(/\s+/g, '').split(';'))
export const splitList = (text: string) =>
  text
    .replace(/\s+/g, '')
    .split(';')
    .filter((entry) => entry !== '');

// The services the dialog sets, with its labels (translate.lang.js
// dialogSettingsFirewallLbl*)
const SERVICES: { id: string; label: () => string; hint: () => string }[] = [
  { id: 'XMLRPC', label: () => m.FW_XMLRPC(), hint: () => m.FW_XMLRPC_HINT() },
  { id: 'REGA', label: () => m.FW_REGA(), hint: () => m.FW_REGA_HINT() },
  { id: 'NEOSERVER', label: () => m.FW_MEDIOLA(), hint: () => m.FW_MEDIOLA_HINT() },
];

const Segmented = <T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) => (
  <div role="radiogroup" aria-label={label} className="inline-flex w-fit rounded-lg bg-muted p-0.5">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        disabled={disabled}
        onClick={() => onChange(option.value)}
        className={
          value === option.value
            ? 'h-8 rounded-md bg-background px-3 text-sm font-medium shadow-xs'
            : 'h-8 rounded-md px-3 text-sm text-muted-foreground'
        }
      >
        {option.label}
      </button>
    ))}
  </div>
);

// The CCU's firewall, as the WebUI's Systemsteuerung → Firewall
// (FirewallConfigDialog in webui.js): the policy, the access to the
// XML-RPC API, the script API and mediola, the addresses for restricted
// access and extra open ports. The CCU applies it at once.
export const Firewall = () => {
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ['firewall'],
    queryFn: () => request({ type: 'getFirewall' }),
    enabled: userLevel === 'admin',
    retry: false,
  });
  const [mode, setMode] = useState<FirewallConfig['mode']>('RESTRICTIVE');
  const [access, setAccess] = useState<Record<string, Access>>({});
  const [ips, setIps] = useState('');
  const [ports, setPorts] = useState('');
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();

  useEffect(() => {
    if (!data) return;
    const fw = data.firewall;
    setMode(fw.mode);
    setAccess(Object.fromEntries(fw.services.map((s) => [s.id, s.access])));
    setIps(fw.ips.join('; '));
    setPorts(fw.userPorts.join('; '));
  }, [data]);

  if (userLevel !== 'admin') return null;
  if (isError) return <OnlyOnCCU title={m.FW_TITLE()} />;
  if (!data) {
    return (
      <Panel aria-label={m.FW_TITLE()} aria-busy>
        <h2>{m.FW_TITLE()}</h2>
        <PanelSkeleton lines={5} />
      </Panel>
    );
  }

  const fw = data.firewall;
  const ipList = splitList(ips);
  const portList = splitList(ports);
  const badIps = ipList.filter((ip) => !validFirewallAddress(ip));
  const badPorts = portList.filter((p) => !validPort(p));
  const services = fw.services.map((s) => ({ ...s, access: access[s.id] ?? s.access }));
  const changed =
    mode !== fw.mode ||
    services.some((s) => s.access !== fw.services.find((o) => o.id === s.id)?.access) ||
    ipList.join(';') !== fw.ips.join(';') ||
    portList.join(';') !== fw.userPorts.join(';');
  const disabled = !elevated || busy;
  const valid = badIps.length === 0 && badPorts.length === 0;

  const save = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request(
            {
              type: 'setFirewall',
              firewall: { mode, services, ips: ipList, userPorts: portList },
              ...(pw !== undefined ? { password: pw } : {}),
            },
            { queue: false, timeoutMs: 60000 },
          );
          showToast(m.SAVED(), 'info');
          await queryClient.invalidateQueries({ queryKey: ['firewall'] });
        } finally {
          setBusy(false);
        }
      },
      (error) => showToast(errorText(error, m.CHANGE_FAILED)),
    );

  const accessOptions: { value: Access; label: string }[] = [
    { value: 'full', label: m.FW_FULL() },
    { value: 'restricted', label: m.FW_RESTRICTED() },
    { value: 'none', label: m.FW_NONE() },
  ];

  return (
    <Panel aria-label={m.FW_TITLE()}>
      <h2>{m.FW_TITLE()}</h2>
      <div className="flex flex-col gap-1">
        <span className="text-sm">{m.FW_POLICY()}</span>
        <Segmented
          label={m.FW_POLICY()}
          value={mode}
          disabled={disabled}
          onChange={setMode}
          options={[
            { value: 'RESTRICTIVE', label: m.FW_PORTS_BLOCKED() },
            { value: 'MOST_OPEN', label: m.FW_PORTS_OPEN() },
          ]}
        />
        <span className="text-xs text-muted-foreground">
          {mode === 'RESTRICTIVE' ? m.FW_POLICY_RESTRICTIVE_HINT() : m.FW_POLICY_OPEN_HINT()}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {SERVICES.filter((service) => fw.services.some((s) => s.id === service.id)).map((service) => (
          <div key={service.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="flex flex-col gap-0.5 text-sm">
              {service.label()}
              <span className="text-xs text-muted-foreground">{service.hint()}</span>
            </div>
            <Segmented
              label={service.label()}
              value={access[service.id] ?? 'none'}
              options={accessOptions}
              disabled={disabled}
              onChange={(value) => setAccess({ ...access, [service.id]: value })}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{m.FW_ACCESS_HINT()}</p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm">{m.FW_IPS()}</span>
        <Input
          className="font-mono"
          disabled={disabled}
          value={ips}
          placeholder="192.168.0.0/16; fc00::/7"
          aria-invalid={badIps.length > 0}
          onChange={(e) => setIps(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">{m.FW_IPS_HINT()}</span>
      </label>
      {badIps.length > 0 && (
        <p className="text-xs text-destructive">{m.FW_IPS_INVALID({ entries: badIps.join(', ') })}</p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm">{m.FW_PORTS()}</span>
        <Input
          className="font-mono"
          disabled={disabled}
          value={ports}
          placeholder="8080; 1883"
          aria-invalid={badPorts.length > 0}
          onChange={(e) => setPorts(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">{m.FW_PORTS_HINT()}</span>
      </label>
      {badPorts.length > 0 && (
        <p className="text-xs text-destructive">{m.FW_PORTS_INVALID({ entries: badPorts.join(', ') })}</p>
      )}
      {password.field}
      <div className="flex justify-end">
        <Button type="button" disabled={disabled || !changed || !valid || password.blocked} onClick={save}>
          {m.SAVE()}
        </Button>
      </div>
    </Panel>
  );
};
