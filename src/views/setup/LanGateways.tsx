import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import PlusIcon from '~icons/lucide/plus';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { useDevices } from '../../queries';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { Panel } from './Panel';
import { usePasswordRetry } from './usePasswordRetry';
import { m } from '../../paraglide/messages';
import type { LanGateway, LanGatewayState, RadioModule } from '../../types/protocol';

type GatewayType = LanGateway['type'];

// globalLGWTypeMap in webui.js
export const GATEWAY_TYPES: Record<GatewayType, { label: string; class: LanGateway['class'] }> = {
  HMLGW2: { label: 'HomeMatic RF-LAN Gateway', class: 'RF' },
  'Lan Interface': { label: 'HM Configuration Tool LAN', class: 'RF' },
  HMWLGW: { label: 'HomeMatic RS485 Gateway', class: 'Wired' },
};

// The characters BidcosRfPage.Gateway.keyContainsNoForbiddenCharacter
// rejects in a new key
export const KEY_FORBIDDEN = /[<>'"&$?[\]{}#\\]/;

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

// What is wrong with a gateway, as the server checks it
export const gatewayErrors = (g: LanGateway, others: LanGateway[]) => {
  const errors: Partial<Record<'serial' | 'key' | 'ip' | 'name', true>> = {};
  if (!/^[A-Z0-9]{1,20}$/.test(g.serial) || others.some((o) => o.serial === g.serial)) errors.serial = true;
  if (!g.key || /[\r\n[\]]/.test(g.key)) errors.key = true;
  if (/[\r\n[\]]/.test(g.name)) errors.name = true;
  if (g.ip && !IPV4.test(g.ip) && !/^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/.test(g.ip)) errors.ip = true;
  return errors;
};

const stripState = ({ class: cls, type, name, serial, key, ip }: LanGatewayState | LanGateway): LanGateway => ({ class: cls, type, name, serial, key, ip });

const GatewayDialog = ({ initial, others, wiredExists, onDone, onCancel }: { initial?: LanGateway; others: LanGateway[]; wiredExists: boolean; onDone: (g: LanGateway) => void; onCancel: () => void }) => {
  const [g, setG] = useState<LanGateway>(initial ?? { class: 'RF', type: 'HMLGW2', name: '', serial: '', key: '', ip: '' });
  const errors = gatewayErrors(g, others);
  const valid = Object.keys(errors).length === 0;
  const passphrase = g.type !== 'Lan Interface';
  const types = (Object.keys(GATEWAY_TYPES) as GatewayType[]).filter((t) => t !== 'HMWLGW' || !wiredExists || initial?.type === 'HMWLGW');
  const field = (key: 'name' | 'serial' | 'key' | 'ip', label: string, mono = false) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
        className={mono ? 'font-mono' : undefined}
        value={g[key]}
        aria-invalid={g[key] !== '' && !!errors[key]}
        // Serial numbers and access codes are upper case (AddGatewayDialog)
        onChange={(e) => setG({ ...g, [key]: key === 'serial' || (key === 'key' && !passphrase) ? e.target.value.toUpperCase().trim() : e.target.value })}
      />
    </label>
  );
  return (
    <ConfirmDialog title={initial ? m.LGW_EDIT() : m.LGW_ADD()} confirmLabel={m.LGW_OK()} busy={!valid} onConfirm={() => onDone(g)} onCancel={onCancel}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.LGW_TYPE()}</span>
          <NativeSelect value={g.type} disabled={!!initial} onChange={(e) => setG({ ...g, type: e.target.value as GatewayType, class: GATEWAY_TYPES[e.target.value as GatewayType].class })}>
            {types.map((t) => (
              <option key={t} value={t}>
                {GATEWAY_TYPES[t].class === 'RF' ? 'Funk' : 'Wired'}: {GATEWAY_TYPES[t].label}
              </option>
            ))}
          </NativeSelect>
        </label>
        {field('name', m.LGW_NAME())}
        {field('serial', m.LGW_SERIAL(), true)}
        {field('key', passphrase ? m.LGW_PASSPHRASE() : m.LGW_ACCESS_CODE(), true)}
        {field('ip', m.LGW_IP(), true)}
      </div>
    </ConfirmDialog>
  );
};

const ChangeKeyDialog = ({ gateway, onClose }: { gateway: LanGateway; onClose: () => void }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const [key, setKey] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();
  const valid = key !== '' && key === repeat && !KEY_FORBIDDEN.test(key);
  const change = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request({ type: 'changeLanGatewayKey', serial: gateway.serial, key, ...(pw !== undefined ? { password: pw } : {}) }, { queue: false, timeoutMs: 60000 });
          showToast(m.LGW_SAVED_RESTART(), 'info');
          onClose();
        } finally {
          setBusy(false);
        }
      },
      (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    );
  return (
    <ConfirmDialog title={`${m.LGW_CHANGE_KEY()}: ${gateway.name || gateway.serial}`} confirmLabel={m.LGW_CHANGE_KEY()} busy={busy || !valid || password.blocked} onConfirm={change} onCancel={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.LGW_NEW_KEY()}</span>
          <Input type="password" autoComplete="new-password" value={key} onChange={(e) => setKey(e.target.value)} aria-invalid={KEY_FORBIDDEN.test(key)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.LGW_NEW_KEY_REPEAT()}</span>
          <Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-invalid={repeat !== '' && repeat !== key} />
        </label>
        {KEY_FORBIDDEN.test(key) && <p className="text-xs text-destructive">{m.LGW_KEY_FORBIDDEN()}</p>}
        {password.field}
      </div>
    </ConfirmDialog>
  );
};

const STATE_BADGE: Record<LanGatewayState['state'], { label: () => string; variant: 'success' | 'destructive' | 'warning' | 'secondary' }> = {
  connected: { label: () => m.CONNECTED(), variant: 'success' },
  disconnected: { label: () => m.DISCONNECTED(), variant: 'destructive' },
  wrongKey: { label: () => m.LGW_WRONG_KEY(), variant: 'warning' },
  inactive: { label: () => m.LGW_INACTIVE(), variant: 'secondary' },
};

// The assignment of the BidCos-RF devices to the radio modules
// (BidcosRfPage: Interface-Zuordnung, EditAssignmentDialog): a fixed
// module, or roaming between them
const Assignment = ({ modules, gateways, disabled }: { modules: RadioModule[]; gateways: LanGatewayState[]; disabled: boolean }) => {
  const { request } = useWebSocketActions();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: devices = [] } = useDevices();
  const bidcos = devices.filter((d) => d.interfaceName === 'BidCos-RF' && d.address !== 'BidCoS-RF');
  const moduleName = (address: string) => {
    const module = modules.find((mod) => mod.address === address);
    const gateway = gateways.find((g) => g.serial === address);
    // Modules that are no LAN gateway are the CCU's own
    const name = gateway ? gateway.name || address : `${m.LGW_BUILTIN()} ${address}`;
    return module?.default ? `${name} (${m.LGW_DEFAULT()})` : name;
  };
  const assign = async (address: string, module: string, roaming: boolean) => {
    try {
      await request({ type: 'setBidcosInterface', address, module, roaming }, { queue: false });
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (error) {
      showToast(`${m.CHANGE_FAILED()}: ${(error as Error).message}`);
    }
  };
  if (modules.length === 0 || bidcos.length === 0) return null;
  return (
    <Panel aria-label={m.LGW_ASSIGNMENT()}>
      <h2>{m.LGW_ASSIGNMENT()}</h2>
      <p className="text-xs text-muted-foreground">{m.LGW_ASSIGNMENT_HINT()}</p>
      <ul aria-label={m.LGW_ASSIGNMENT()} className="flex flex-col divide-y rounded-lg border">
        {bidcos.map((device) => {
          const label = device.name || device.address;
          const current = device.interface ?? modules.find((mod) => mod.default)?.address ?? '';
          return (
            <li key={device.address} aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm">
              <span className="min-w-[200px] flex-1">
                <span className="font-medium">{label}</span>{' '}
                {!label.includes(device.address) && <span className="font-mono text-xs text-muted-foreground">{device.address}</span>}
              </span>
              <NativeSelect className="w-60" aria-label={m.LGW_MODULE_OF({ name: label })} disabled={disabled} value={current} onChange={(e) => assign(device.address, e.target.value, !!device.roaming)}>
                {modules.map((mod) => (
                  <option key={mod.address} value={mod.address}>
                    {moduleName(mod.address)}
                  </option>
                ))}
              </NativeSelect>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" className="size-4 accent-primary" checked={!!device.roaming} disabled={disabled} onChange={(e) => assign(device.address, current, e.target.checked)} />
                {m.LGW_ROAMING()}
              </label>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

// The LAN gateways of the BidCos interfaces, as the WebUI's
// Systemsteuerung → LAN-Gateway (BidcosRfPage in webui.js): RF gateways
// (HM-LGW, HM-CFG-LAN) and the RS485 gateway with their state, added,
// changed and removed together and taken on the next start; a new key for
// HM-LGW and RS485 gateways; and which radio module serves each device.
export const LanGateways = () => {
  usePageTitle(m.SETUP());
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ['lanGateways'],
    queryFn: () => request({ type: 'getLanGateways' }),
    enabled: userLevel === 'admin',
    // The connection state, as the WebUI every 5 s
    refetchInterval: 5000,
    retry: false,
  });
  const [list, setList] = useState<LanGateway[] | null>(null);
  const [editing, setEditing] = useState<LanGateway | 'new' | null>(null);
  const [removing, setRemoving] = useState<LanGateway | null>(null);
  const [changingKey, setChangingKey] = useState<LanGateway | null>(null);
  const [busy, setBusy] = useState(false);
  const password = usePasswordRetry();
  const saved = data?.gateways.map(stripState);

  useEffect(() => {
    if (data && list === null) setList(data.gateways.map(stripState));
  }, [data, list]);

  if (userLevel !== 'admin' || isError) return null;
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{m.LGW_TITLE()}</h1>
        <p className="text-sm text-muted-foreground">{m.LGW_HINT()}</p>
      </div>
      {elevated && list && (
        <Button type="button" onClick={() => setEditing('new')}>
          <PlusIcon />
          {m.LGW_ADD()}
        </Button>
      )}
    </div>
  );
  if (!data || !list) {
    return (
      <>
        {header}
        <Panel aria-label={m.LGW_TITLE()} aria-busy>
          <PanelSkeleton lines={3} />
        </Panel>
      </>
    );
  }

  const changed = JSON.stringify(list) !== JSON.stringify(saved);
  const disabled = !elevated || busy;
  const stateOf = (serial: string) => data.gateways.find((g) => g.serial === serial);

  const apply = () =>
    password.run(
      async (pw) => {
        setBusy(true);
        try {
          await request({ type: 'setLanGateways', gateways: list, ...(pw !== undefined ? { password: pw } : {}) }, { queue: false, timeoutMs: 60000 });
          showToast(m.LGW_SAVED_RESTART(), 'info');
          await queryClient.invalidateQueries({ queryKey: ['lanGateways'] });
          setList(null);
        } finally {
          setBusy(false);
        }
      },
      (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
    );

  return (
    <>
      {header}
      <Panel aria-label={m.LGW_TITLE()}>
        {list.length === 0 && <p className="text-sm text-muted-foreground">{m.LGW_NONE()}</p>}
        {list.length > 0 && (
          <ul aria-label={m.LGW_TITLE()} className="flex flex-col divide-y rounded-lg border">
            {list.map((g) => {
              const state = stateOf(g.serial);
              const badge = STATE_BADGE[state?.state ?? 'inactive'];
              return (
                <li key={g.serial} aria-label={g.name || g.serial} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 text-sm">
                  <span className="flex min-w-[220px] flex-1 flex-col">
                    <span className="font-medium">
                      {g.name || g.serial} {g.name && <span className="font-mono text-xs text-muted-foreground">{g.serial}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {GATEWAY_TYPES[g.type].label}
                      {g.ip && ` · ${g.ip}`}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    <Badge variant={badge.variant}>{badge.label()}</Badge>
                    {state?.default && <Badge variant="outline">{m.LGW_DEFAULT()}</Badge>}
                  </span>
                  {elevated && (
                    <span className="ml-auto flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setEditing(g)}>
                        {m.EDIT()}
                      </Button>
                      {(g.type === 'HMLGW2' || g.type === 'HMWLGW') && state && (
                        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setChangingKey(g)}>
                          {m.LGW_CHANGE_KEY()}
                        </Button>
                      )}
                      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setRemoving(g)}>
                        {m.LGW_REMOVE()}
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {changed && <p className="text-xs text-amber-700 dark:text-amber-400">{m.LGW_UNSAVED()}</p>}
        {password.field}
        {elevated && (
          <div className="flex justify-end gap-2">
            {changed && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => setList(saved ?? [])}>
                {m.CANCEL()}
              </Button>
            )}
            <Button type="button" disabled={disabled || !changed || password.blocked} onClick={apply}>
              {m.LGW_APPLY()}
            </Button>
          </div>
        )}
      </Panel>
      <Assignment modules={data.modules} gateways={data.gateways} disabled={!elevated} />
      {editing && (
        <GatewayDialog
          initial={editing === 'new' ? undefined : editing}
          others={list.filter((g) => g !== editing)}
          wiredExists={list.some((g) => g.class === 'Wired')}
          onCancel={() => setEditing(null)}
          onDone={(g) => {
            setList(editing === 'new' ? [...list, g] : list.map((o) => (o === editing ? g : o)));
            setEditing(null);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={m.LGW_REMOVE()}
          confirmLabel={m.LGW_REMOVE()}
          destructive
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            setList(list.filter((g) => g !== removing));
            setRemoving(null);
          }}
        >
          {m.LGW_REMOVE_QUESTION({ name: removing.name || removing.serial })}
        </ConfirmDialog>
      )}
      {changingKey && <ChangeKeyDialog gateway={changingKey} onClose={() => setChangingKey(null)} />}
    </>
  );
};
