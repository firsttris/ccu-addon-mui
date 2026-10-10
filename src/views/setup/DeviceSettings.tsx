import { type HTMLAttributes, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { DeviceImage } from '../../components/DeviceImage';
import { useQueries } from '@tanstack/react-query';
import { useDevices, usePairingAction, useParamset, usePutParamset } from '../../queries';
import { RequestError, useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { ElevateDialog } from '../../components/ElevateDialog';
import { useToast } from '../../contexts/ToastContext';
import { type TranslationKey, useTranslations } from '../../i18n/utils';
import type { DatapointValue, ParamsetDescription } from '../../types/types';
import { shownParameters } from '../../controls/generic/ParamsetView';
import { readableValue } from '../../controls/generic/SettingsView';
import CheckIcon from '~icons/lucide/check-circle-2';
import SendIcon from '~icons/lucide/send';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { useHasWebUI, WebUILink } from '../../components/WebUILink';
import ChevronLeftIcon from '~icons/lucide/chevron-left';
import TrashIcon from '~icons/lucide/trash-2';
import { Notice } from './SetupShell';
import { Panel } from './Panel';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { useChannelNames } from './channelNames';
import { ChannelMeta, NameField, useRename } from './ChannelMeta';
import { useChannelList } from '../../queries';
import { isHiddenChannel } from '../../hooks/channels';
import { humanize } from '../../controls/generic/parameters';
import { cn } from '../../lib/utils';
import InfoIcon from '~icons/lucide/info';
import ChevronRightIcon from '~icons/lucide/chevron-right';
import { GroupedSettings } from './GroupedSettings';
import { WeekProfileSheet } from '../../controls/ThermostatControl/profile/WeekProfileSheet';
import { WeekProgramSheet, type WeekProgramKind } from '../../controls/schedule/WeekProgramSheet';
import { parameterLabel } from '../../controls/generic/parameters';
import { Links } from './Links';
import { DevicePrograms } from './DevicePrograms';
import { ComTest } from './ComTest';
import { DeviceHistory } from './DeviceHistory';
import { DeviceSysvars, useDeviceSysvars } from './DeviceSysvars';
import { Firmware } from './Firmware';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';

import { DEVICE_TABS, type DeviceTab } from './deviceTabs';
import { errorText } from '../../lib/errors';
export { DEVICE_TABS, type DeviceTab };

const Section = (props: HTMLAttributes<HTMLElement>) => <Panel {...props} />;

const weekProgramKindOf = (type: string): WeekProgramKind | null =>
  !type.endsWith('_WEEK_PROFILE')
    ? null
    : type.startsWith('BLIND') || type.startsWith('SHUTTER')
      ? 'blind'
      : type.startsWith('SWITCH') || type.startsWith('WATER_SWITCH')
        ? 'switch'
        : 'dimmer';

type Values = Record<string, DatapointValue>;

// Settings (MASTER paramsets) of a device and its channels. Changes are
// collected first and saved after a confirmation listing old and new
// values.
export const DeviceSettings = () => {
  const { interfaceName, address } = useParams({
    from: '/device/$interfaceName/$address',
  });
  const search = useSearch({ from: '/device/$interfaceName/$address' });
  const t = useTranslations();
  const { showToast } = useToast();
  const { request } = useWebSocketActions();
  const { userLevel, elevated, capabilities } = useWebSocketContext();
  const hasWebUI = useHasWebUI();
  const isAdmin = userLevel === 'admin';
  const canEdit = isAdmin && elevated;
  const [elevating, setElevating] = useState(false);
  const { data: devices, isPending: devicesLoading } = useDevices();
  const names = useChannelNames();
  const putParamset = usePutParamset();
  const pairingAction = usePairingAction();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  // The channel whose settings are pointed at, marked in the picture
  const [activeChannel, setActiveChannel] = useState<string | undefined>();
  const [scheduleAddress, setScheduleAddress] = useState<string | null>(null);
  const [deleteOptions, setDeleteOptions] = useState({
    reset: false,
    force: false,
  });

  const device = devices?.find((d) => d.address === address && d.interfaceName === interfaceName);
  // Device-wide settings are on the device (BidCos) or its channel 0 (HmIP)
  const addresses = useMemo(() => [address, ...(device?.children ?? [])], [address, device]);

  const descriptions = useQueries({
    queries: addresses.map((a) => ({
      queryKey: ['paramsetDescription', interfaceName, a, 'MASTER'],
      queryFn: async () =>
        ((
          await request({
            type: 'getParamsetDescription',
            interfaceName,
            address: a,
            paramsetKey: 'MASTER',
          })
        ).description ?? {}) as ParamsetDescription,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const values = useQueries({
    queries: addresses.map((a) => ({
      queryKey: ['paramset', interfaceName, a, 'MASTER'],
      queryFn: async () =>
        ((
          await request({
            type: 'getParamset',
            interfaceName,
            address: a,
            paramsetKey: 'MASTER',
          })
        ).values ?? {}) as Values,
      retry: false,
    })),
  });

  // After saving the CCU transfers the settings to the device; battery
  // devices only fetch them when woken up. CONFIG_PENDING (channel 0)
  // tells, so it is watched for two minutes after saving.
  const [transferSince, setTransferSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const watching = transferSince !== null && now - transferSince < 120_000;
  // Renders again when "sending" turns into "done" and when watching ends,
  // not every second
  useEffect(() => {
    if (transferSince === null) return;
    const timers = [4000, 120_000].map((ms) => setTimeout(() => setNow(Date.now()), transferSince + ms - Date.now()));
    return () => timers.forEach(clearTimeout);
  }, [transferSince]);
  const hasMaintenance = device?.children?.includes(`${address}:0`) === true;
  const { data: maintenance } = useParamset(interfaceName, `${address}:0`, 'VALUES', {
    enabled: hasMaintenance,
    refetchInterval: watching ? 2000 : false,
  });
  const configPending = maintenance?.CONFIG_PENDING === true;
  // The CCU needs a moment to mark the device pending; until then nothing
  // is claimed
  const transfer: 'none' | 'sending' | 'pending' | 'done' | 'handedOver' =
    transferSince === null
      ? 'none'
      : configPending
        ? 'pending'
        : !hasMaintenance || maintenance?.CONFIG_PENDING === undefined
          ? 'handedOver'
          : now - transferSince < 4000
            ? 'sending'
            : 'done';

  const [drafts, setDrafts] = useState<Record<string, Values>>({});
  const [confirming, setConfirming] = useState(false);

  const setDraft = useCallback(
    (a: string, current: Values, name: string, value: DatapointValue) =>
      setDrafts((prev) => {
        const next = { ...(prev[a] ?? {}), [name]: value };
        // Back to the saved value: no change
        if (current[name] === value) {
          delete next[name];
        }
        return { ...prev, [a]: next };
      }),
    [],
  );

  const sections = addresses
    .map((a, i) => ({
      address: a,
      description: descriptions[i].data,
      current: values[i].data ?? {},
    }))
    .filter(
      (
        s,
      ): s is {
        address: string;
        description: ParamsetDescription;
        current: Values;
      } => s.description !== undefined && shownParameters(s.description).length > 0,
    );

  const changes = sections.flatMap((s) =>
    Object.entries(drafts[s.address] ?? {}).map(([name, value]) => ({
      address: s.address,
      name,
      parameter: s.description[name],
      previous: s.current[name],
      value,
    })),
  );

  const save = async () => {
    try {
      for (const s of sections) {
        const draft = drafts[s.address];
        if (draft && Object.keys(draft).length > 0) {
          await putParamset.mutateAsync({
            interfaceName,
            address: s.address,
            values: draft,
          });
        }
      }
      setDrafts({});
      setTransferSince(Date.now());
      setNow(Date.now());
      showToast(m.SAVED(), 'info');
    } catch (error) {
      if (error instanceof RequestError && error.code === 'ELEVATION_REQUIRED') {
        // The 8 hours are over: ask for the password, keep the changes
        setElevating(true);
      } else {
        showToast(`${m.SAVE_FAILED()}: ${error instanceof Error ? error.message : error}`);
      }
    } finally {
      setConfirming(false);
    }
  };

  // HmIP actuators keep their own week program on a *_WEEK_PROFILE channel
  const scheduleType = device?.channels?.find((c) => c.address === scheduleAddress)?.type ?? '';
  const weekProgramKind = weekProgramKindOf(scheduleType);
  const weekProgramTargets = useMemo(
    () =>
      // Bits of WP_TARGET_CHANNELS: the device's virtual channels in order
      // (getWPVirtualChannels in the WebUI's HmIPWeeklyProgram.js)
      (device?.channels ?? [])
        .filter((c) => /_VIRTUAL_RECEIVER|ACCESS_RECEIVER|ACCESS_TRANSCEIVER|DOOR_LOCK_STATE_TRANSMITTER/.test(c.type))
        .map((c, index) => ({
          index,
          label: names.get(c.address) ?? c.address,
        })),
    [device, names],
  );
  // The channels come with the device list; until it and every description
  // and value are there, placeholders stand in for the settings
  const loading = devicesLoading || descriptions.some((d) => d.isPending) || values.some((v) => v.isPending);
  const title = names.get(address) ?? address;
  usePageTitle(title);

  const typeLabel = (type: string) => {
    const label = t(type as TranslationKey);
    return label === type ? humanize(type) : label;
  };
  const rename = useRename();
  const { data: allChannels } = useChannelList();
  const regaOf = new Map(
    (allChannels ?? []).filter((c) => c.address.startsWith(`${address}:`)).map((c) => [c.address, c]),
  );
  const sectionOf = new Map(sections.map((s) => [s.address, s]));
  // One card per channel; channel 0 (maintenance) belongs to the device card
  const cards = [
    ...new Map(
      [
        ...[...regaOf.values()].map((c) => ({
          address: c.address,
          type: c.type,
          index: Number(c.address.split(':')[1]),
        })),
        // The interface's description wins: it knows every channel
        ...(device?.channels ?? []),
      ].map((c) => [c.address, c]),
    ).values(),
  ]
    .filter((c) => c.index > 0)
    .sort((a, b) => a.index - b.index)
    .map((channel, i, all) => {
      const rega = regaOf.get(channel.address);
      const section = sectionOf.get(channel.address);
      // The 2nd and 3rd virtual channel of an HmIP actuator are rarely
      // needed, as are channels without state and settings
      const secondary = channel.type.endsWith('_VIRTUAL_RECEIVER') && all[i - 1]?.type === channel.type;
      return {
        channel,
        rega,
        section,
        label: names.get(channel.address) ?? rega?.name ?? channel.address,
        folded: secondary || (!section && (!rega || isHiddenChannel(rega))),
      };
    });
  const deviceSections = [address, `${address}:0`].map((a) => sectionOf.get(a)).filter((s) => s !== undefined);

  const hasLinks = (device?.channels ?? []).some((c) => c.linkSourceRoles?.length || c.linkTargetRoles?.length);
  const tabs = [
    { id: 'channels' as const, label: m.DEVICE_TAB_CHANNELS(), shown: true },
    { id: 'links' as const, label: m.LINKS(), shown: canEdit && hasLinks },
    { id: 'programs' as const, label: m.PROGRAMS(), shown: capabilities.programs },
    { id: 'history' as const, label: m.DEVHIST(), shown: !!device && capabilities.history },
    {
      id: 'maintenance' as const,
      label: m.DEVICE_TAB_MAINTENANCE(),
      shown: !!device,
    },
  ].filter((tab) => tab.shown);
  const tab = tabs.some((t) => t.id === search.tab) ? (search.tab as DeviceTab) : 'channels';
  const openTab = (id: DeviceTab) =>
    navigate({
      to: '/device/$interfaceName/$address',
      params: { interfaceName, address },
      search: id === 'channels' ? {} : { tab: id },
      replace: true,
    });

  // The settings of one address: collected and transferred together
  const settings = (s: { address: string; description: ParamsetDescription; current: Values }, label: string) => {
    const draft = drafts[s.address] ?? {};
    return (
      <div className="flex flex-col gap-3 border-t pt-4">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {m.DEVICE_SETTINGS_HEADING()}
          {canEdit && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
              <SendIcon className="size-3" />
              {m.DEVICE_SETTINGS_TRANSFER()}
            </span>
          )}
        </h3>
        <GroupedSettings
          label={`${label} ${s.address}`}
          description={s.description}
          values={{ ...s.current, ...draft }}
          changed={new Set(Object.keys(draft))}
          readOnly={!canEdit}
          onSet={(name, value) => setDraft(s.address, s.current, name, value)}
          onEditWeekProfile={() => setScheduleAddress(s.address)}
        />
      </div>
    );
  };
  const point = (channelAddress?: string) => ({
    onPointerEnter: () => setActiveChannel(channelAddress?.split(':')[1]),
    onPointerLeave: () => setActiveChannel(undefined),
    onFocus: () => setActiveChannel(channelAddress?.split(':')[1]),
  });
  const card = (c: (typeof cards)[number]) => (
    <Section
      key={c.channel.address}
      id={`channel-${c.channel.index}`}
      aria-label={c.label}
      className="scroll-mt-24"
      {...point(c.channel.address)}
    >
      <header className="flex items-start gap-3">
        <span className="mt-1.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted font-mono text-xs text-muted-foreground">
          {c.channel.index}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {canEdit && c.rega ? (
            <NameField
              label={`${m.NAME()} ${c.channel.address}`}
              name={c.rega.name}
              onRename={(name) => rename(c.channel.address, name)}
            />
          ) : (
            <h2 className="truncate">{c.label}</h2>
          )}
          <span className="text-xs text-muted-foreground">
            {typeLabel(c.channel.type)} · <span className="font-mono">{c.channel.address}</span>
          </span>
        </div>
      </header>
      {c.rega && <ChannelMeta channel={c.rega} canEdit={canEdit} />}
      {c.section && settings(c.section, c.label)}
    </Section>
  );
  const shownCards = cards.filter((c) => !c.folded);
  const foldedCards = cards.filter((c) => c.folded);
  const jumpTargets = [
    { id: 'device-card', index: '', label: m.DEVICE_SETTINGS() },
    ...shownCards.map((c) => ({
      id: `channel-${c.channel.index}`,
      index: String(c.channel.index),
      label: c.label,
    })),
  ];
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          to="/setup"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
          {m.DEVICES()}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <DeviceImage
              type={device?.type}
              size={96}
              channel={activeChannel}
              className={cn('max-sm:hidden', tab === 'channels' && 'xl:hidden')}
            />
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {device?.type && <Badge variant="outline">{device.type}</Badge>}
                <span className="font-mono text-[13px]">{address}</span>
                <span>· {interfaceName}</span>
                {device?.firmware && (
                  <span>
                    · {m.FIRMWARE()} {device.firmware}
                  </span>
                )}
                {hasWebUI && (
                  <>
                    <span>·</span>
                    <WebUILink />
                  </>
                )}
              </div>
            </div>
          </div>
          {canEdit && device && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                // Each time without reset or force, also after a cancel
                setDeleteOptions({ reset: false, force: false });
                setDeleting(true);
              }}
            >
              <TrashIcon />
              {m.DELETE_DEVICE()}
            </Button>
          )}
        </div>
        <div
          role="tablist"
          aria-label={m.DEVICE_TABS()}
          className="flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => openTab(t.id)}
              className={cn(
                'h-10 shrink-0 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
                tab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {configPending && transfer === 'none' && <Notice role="status">{m.CONFIG_PENDING()}</Notice>}

      {tab === 'channels' && (
        <div
          role="tabpanel"
          aria-label={m.DEVICE_TAB_CHANNELS()}
          className="grid items-start gap-5 xl:grid-cols-[200px_minmax(0,1fr)]"
        >
          <aside className="flex flex-col gap-4 max-xl:hidden xl:sticky xl:top-[81px]">
            <DeviceImage type={device?.type} size={200} channel={activeChannel} />
            {jumpTargets.length > 2 && (
              <nav aria-label={m.DEVICE_JUMP()}>
                <ul className="flex flex-col gap-0.5">
                  {jumpTargets.map((target) => (
                    <li key={target.id}>
                      <button
                        type="button"
                        onClick={() => jump(target.id)}
                        onPointerEnter={() => setActiveChannel(target.index || undefined)}
                        onPointerLeave={() => setActiveChannel(undefined)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground',
                          target.index !== '' && activeChannel === target.index && 'bg-accent text-foreground',
                        )}
                      >
                        <span className="w-4 shrink-0 text-right font-mono text-[11px]">{target.index}</span>
                        <span className="truncate">{target.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </aside>
          <div className="flex min-w-0 flex-col gap-5">
            {canEdit && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <InfoIcon className="mt-px size-3.5 shrink-0" />
                {m.DEVICE_SAVE_HINT()}
              </p>
            )}
            <Section id="device-card" aria-label={m.DEVICE_SETTINGS()} className="scroll-mt-24" {...point(undefined)}>
              <h2>{m.DEVICE_SETTINGS()}</h2>
              {canEdit && (
                <NameField label={`${m.NAME()} ${address}`} name={title} onRename={(name) => rename(address, name)} />
              )}
              {deviceSections.map((s) => (
                <div key={s.address}>{settings(s, m.DEVICE_SETTINGS())}</div>
              ))}
            </Section>
            {shownCards.map(card)}
            {loading && <PanelSkeleton lines={6} className="rounded-xl border bg-card p-5" />}
            {foldedCards.length > 0 && (
              <details className="group rounded-xl border">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                  {m.DEVICE_MORE_CHANNELS({ count: foldedCards.length })}
                </summary>
                <div className="flex flex-col gap-5 border-t p-4">{foldedCards.map(card)}</div>
              </details>
            )}
          </div>
        </div>
      )}
      {tab === 'links' && device && (
        <div role="tabpanel" aria-label={m.LINKS()}>
          <Section aria-label={m.LINKS()}>
            <h2>{m.LINKS()}</h2>
            <Links interfaceName={interfaceName} deviceAddress={address} channels={device.channels ?? []} />
          </Section>
        </div>
      )}
      {tab === 'programs' && (
        <div role="tabpanel" aria-label={m.PROGRAMS()} className="grid items-start gap-5 xl:grid-cols-2">
          <Section aria-label={m.PROGRAMS()}>
            <h2>{m.PROGRAMS()}</h2>
            <DevicePrograms address={address} />
          </Section>
          {device && <DeviceSysvarsSection address={address} />}
        </div>
      )}
      {tab === 'history' && (
        <div role="tabpanel" aria-label={m.DEVHIST()}>
          <Section aria-label={m.DEVHIST()}>
            <h2>{m.DEVHIST()}</h2>
            <DeviceHistory address={address} />
          </Section>
        </div>
      )}
      {tab === 'maintenance' && device && (
        <div role="tabpanel" aria-label={m.DEVICE_TAB_MAINTENANCE()} className="grid items-start gap-5 xl:grid-cols-2">
          <Section aria-label={m.FIRMWARE()}>
            <h2>{m.FIRMWARE()}</h2>
            <Firmware device={device} canEdit={canEdit} />
          </Section>
          {userLevel === 'admin' && capabilities.comTest && (
            <Section aria-label={m.COMTEST()}>
              <h2>{m.COMTEST()}</h2>
              <ComTest address={address} />
            </Section>
          )}
        </div>
      )}

      {canEdit && sections.length > 0 && (tab === 'channels' || changes.length > 0) && (
        <section
          aria-label={m.SETTINGS_SAVE_BAR()}
          className={`sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border p-3 shadow-lg backdrop-blur-md transition-colors ${changes.length > 0 ? 'border-blue-500/40 bg-blue-50/90 dark:bg-blue-950/60' : 'bg-background/85'}`}
        >
          <span role="status" className="mr-auto flex items-center gap-2 text-sm">
            {changes.length > 0 ? (
              <>
                <span className="size-2 rounded-full bg-blue-600" />
                {m.SETTINGS_UNSAVED({ count: changes.length })}
              </>
            ) : transfer === 'sending' ? (
              <>
                <SendIcon className="size-4 animate-pulse text-sky-600" />
                {m.SETTINGS_SENDING()}
              </>
            ) : transfer === 'pending' ? (
              <>
                <SendIcon className="size-4 animate-pulse text-amber-600" />
                {m.CONFIG_PENDING()}
              </>
            ) : transfer === 'done' ? (
              <>
                <CheckIcon className="size-4 text-green-600" />
                {m.SETTINGS_TRANSFERRED()}
              </>
            ) : transfer === 'handedOver' ? (
              <>
                <CheckIcon className="size-4 text-green-600" />
                {m.SETTINGS_HANDED_OVER()}
              </>
            ) : (
              <span className="text-muted-foreground">{m.SETTINGS_NO_CHANGES()}</span>
            )}
          </span>
          {changes.length > 0 && (
            <DialogButton type="button" onClick={() => setDrafts({})}>
              {m.RESET()}
            </DialogButton>
          )}
          <DialogButton type="button" primary disabled={changes.length === 0} onClick={() => setConfirming(true)}>
            <SendIcon />
            {m.SETTINGS_SAVE_TRANSFER()} {changes.length > 0 ? `(${changes.length})` : ''}
          </DialogButton>
        </section>
      )}

      {deleting && (
        <ConfirmDialog
          title={m.DELETE_DEVICE()}
          confirmLabel={m.DELETE()}
          busy={pairingAction.isPending}
          destructive
          onCancel={() => setDeleting(false)}
          onConfirm={() =>
            pairingAction.mutate(
              {
                type: 'deleteDevice',
                interfaceName,
                address,
                ...deleteOptions,
              },
              {
                onSuccess: () => {
                  showToast(m.DELETED(), 'info');
                  navigate({ to: '/setup' });
                },
                onError: (error) => showToast(errorText(error, m.CHANGE_FAILED)),
                onSettled: () => setDeleting(false),
              },
            )
          }
        >
          <p>{m.DELETE_DEVICE_CONFIRM()}</p>
          {(['reset', 'force'] as const).map((option) => (
            <label key={option} className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={deleteOptions[option]}
                onChange={(event) =>
                  setDeleteOptions((prev) => ({
                    ...prev,
                    [option]: event.target.checked,
                  }))
                }
              />
              {t(option === 'reset' ? 'DELETE_RESET' : 'DELETE_FORCE')}
            </label>
          ))}
        </ConfirmDialog>
      )}

      {elevating && <ElevateDialog onDone={() => setElevating(false)} onCancel={() => setElevating(false)} />}
      {weekProgramKind ? (
        <WeekProgramSheet
          open={scheduleAddress !== null}
          onOpenChange={(open) => !open && setScheduleAddress(null)}
          interfaceName={interfaceName}
          address={scheduleAddress ?? address}
          name={title}
          kind={weekProgramKind}
          targets={weekProgramTargets}
        />
      ) : (
        <WeekProfileSheet
          open={scheduleAddress !== null}
          onOpenChange={(open) => !open && setScheduleAddress(null)}
          interfaceName={interfaceName}
          address={scheduleAddress ?? address}
          name={names.get(scheduleAddress ?? address) ?? title}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={m.SAVE_CHANGES()}
          confirmLabel={m.SAVE()}
          busy={putParamset.isPending}
          onConfirm={save}
          onCancel={() => setConfirming(false)}
        >
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {changes.map((c) => (
              <li key={`${c.address}.${c.name}`}>
                <strong>{parameterLabel(c.name)}</strong> ({names.get(c.address) ?? c.address}):{' '}
                {readableValue(c.name, c.parameter, c.previous)} → {readableValue(c.name, c.parameter, c.value)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted-foreground">{m.SETTINGS_TRANSFER_HINT()}</p>
        </ConfirmDialog>
      )}
    </>
  );
};

// Only with variables assigned to the device's channels
const DeviceSysvarsSection = ({ address }: { address: string }) => {
  const { assigned, names } = useDeviceSysvars(address);
  if (assigned.length === 0) {
    return null;
  }
  return (
    <Section aria-label={m.SYSVARS()}>
      <h2>{m.SYSVARS()}</h2>
      <DeviceSysvars assigned={assigned} names={names} />
    </Section>
  );
};
