import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { OnlyOnCCU, Panel } from './Panel';
import { m } from '../../paraglide/messages';
import type { NetConfig } from '../../types/protocol';
import { errorText } from '../../lib/errors';

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HOSTNAME = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

const toNumber = (ip: string) => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);

// A netmask is ones followed by zeros (isSubnetMaskValid)
export const validNetmask = (mask: string) => {
  if (!IPV4.test(mask)) return false;
  const n = toNumber(mask);
  if (n === 0) return false;
  const inverted = 0xffffffff - n;
  return (inverted & (inverted + 1)) === 0;
};

// What is wrong with a network setup, as the WebUI's checks in
// cp_network.cgi, and the gateway in the network
export const networkErrors = (c: NetConfig) => {
  const errors: Partial<Record<keyof NetConfig, true>> = {};
  if (!HOSTNAME.test(c.hostname)) errors.hostname = true;
  if (c.dhcp) return errors;
  if (!IPV4.test(c.ip)) errors.ip = true;
  if (!validNetmask(c.netmask)) errors.netmask = true;
  if (!IPV4.test(c.gateway)) errors.gateway = true;
  if (c.dns1 && !IPV4.test(c.dns1)) errors.dns1 = true;
  if (c.dns2 && !IPV4.test(c.dns2)) errors.dns2 = true;
  if (!errors.ip && !errors.netmask && !errors.gateway) {
    const mask = toNumber(c.netmask);
    // Bitwise AND works on signed 32 bits: compare the unsigned results
    if ((toNumber(c.ip) & mask) >>> 0 !== (toNumber(c.gateway) & mask) >>> 0) errors.gateway = true;
  }
  return errors;
};

// The CCU's network setup, as the WebUI's Systemsteuerung →
// Netzwerkeinstellungen (cp_network.cgi): host name, DHCP or fixed
// addresses, name servers, and OpenCCU's Tailscale VPN. The CCU takes the
// addresses on its next start.
export const Network = () => {
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ['network'],
    queryFn: () => request({ type: 'getNetwork' }),
    enabled: userLevel === 'admin',
    retry: false,
  });
  const [config, setConfig] = useState<NetConfig | null>(null);
  const [tailscale, setTailscale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setConfig(data.config);
    setTailscale(data.tailscale.enabled);
  }, [data]);

  if (userLevel !== 'admin') return null;
  if (isError) return <OnlyOnCCU title={m.NET_TITLE()} />;
  if (!data || !config) {
    return (
      <Panel aria-label={m.NET_TITLE()} aria-busy>
        <h2>{m.NET_TITLE()}</h2>
        <PanelSkeleton lines={4} />
      </Panel>
    );
  }

  const errors = networkErrors(config);
  const valid = Object.keys(errors).length === 0;
  const changed = JSON.stringify(config) !== JSON.stringify(data.config) || tailscale !== data.tailscale.enabled;
  const disabled = !elevated || busy;
  const set = (patch: Partial<NetConfig>) => setConfig({ ...config, ...patch });

  const save = async () => {
    setBusy(true);
    try {
      await request({ type: 'setNetwork', config, tailscale }, { queue: false });
      showToast(m.SAVED(), 'info');
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ['network'] });
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof NetConfig, label: string, optional = false) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        className="w-44 font-mono"
        inputMode={key === 'hostname' ? 'text' : 'decimal'}
        disabled={disabled || (key !== 'hostname' && config.dhcp)}
        value={config[key] as string}
        placeholder={optional ? m.NET_OPTIONAL() : undefined}
        aria-invalid={!!errors[key]}
        onChange={(e) => set({ [key]: e.target.value.trim() } as Partial<NetConfig>)}
      />
    </label>
  );

  return (
    <Panel aria-label={m.NET_TITLE()}>
      <h2>{m.NET_TITLE()}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{m.NET_CURRENT()}</dt>
        <dd className="font-mono tabular-nums">
          {data.current.ip ? `${data.current.ip} / ${data.current.netmask}` : '–'}
          {data.current.gateway && ` · ${m.NET_GATEWAY()} ${data.current.gateway}`}
        </dd>
        {data.current.mac && (
          <>
            <dt className="text-muted-foreground">{m.NET_MAC()}</dt>
            <dd className="font-mono">{data.current.mac}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-wrap items-end gap-3">{field('hostname', m.NET_HOSTNAME())}</div>
      <div role="radiogroup" aria-label={m.NET_MODE()} className="inline-flex w-fit rounded-lg bg-muted p-0.5">
        {[
          { dhcp: true, label: m.NET_DHCP() },
          { dhcp: false, label: m.NET_MANUAL() },
        ].map((option) => (
          <button
            key={String(option.dhcp)}
            type="button"
            role="radio"
            aria-checked={config.dhcp === option.dhcp}
            disabled={disabled}
            onClick={() => set({ dhcp: option.dhcp })}
            className={
              config.dhcp === option.dhcp
                ? 'h-8 rounded-md bg-background px-3 text-sm font-medium shadow-xs'
                : 'h-8 rounded-md px-3 text-sm text-muted-foreground'
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      {!config.dhcp && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {field('ip', m.NET_IP())}
            {field('netmask', m.NET_NETMASK())}
            {field('gateway', m.NET_GATEWAY())}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {field('dns1', m.NET_DNS1(), true)}
            {field('dns2', m.NET_DNS2(), true)}
          </div>
          {errors.gateway && !errors.ip && <p className="text-xs text-destructive">{m.NET_GATEWAY_OUTSIDE()}</p>}
          <p className="text-xs text-amber-700 dark:text-amber-400">{m.NET_MANUAL_WARNING()}</p>
        </>
      )}
      {data.tailscale.available && (
        <div className="flex items-start justify-between gap-4">
          <label htmlFor="net-tailscale" className="flex flex-col gap-0.5 text-sm">
            {m.NET_TAILSCALE()}
            <span className="text-xs text-muted-foreground">{m.NET_TAILSCALE_HINT()}</span>
          </label>
          <Switch id="net-tailscale" checked={tailscale} disabled={disabled} onCheckedChange={setTailscale} />
        </div>
      )}
      {saved && (
        <p role="status" className="text-xs">
          {m.NET_RESTART_HINT()}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" disabled={disabled || !valid || !changed} onClick={save}>
          {m.SAVE()}
        </Button>
      </div>
    </Panel>
  );
};
