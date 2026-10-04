import { HTMLAttributes, useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { useDevices, usePairingAction, useParamset, usePutParamset } from '../../queries';
import { RequestError, useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { ElevateDialog } from '../../components/ElevateDialog';
import { useToast } from '../../contexts/ToastContext';
import { TranslationKey, useTranslations } from '../../i18n/utils';
import { DatapointValue, ParamsetDescription } from '../../types/types';
import { formatParameterValue, ParamsetView, shownParameters } from '../../controls/generic/ParamsetView';
import { ConfirmDialog, DialogButton } from '../../components/ConfirmDialog';
import { WebUILink } from '../../components/WebUILink';
import ChevronLeftIcon from '~icons/lucide/chevron-left';
import TrashIcon from '~icons/lucide/trash-2';
import { Notice } from './SetupShell';
import { Panel } from './Panel';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { useChannelNames } from './channelNames';
import { NamesAndRooms } from './NamesAndRooms';
import { GroupedSettings } from './GroupedSettings';
import { WeekProfileSheet } from '../../controls/ThermostatControl/profile/WeekProfileSheet';
import { WeekProgramSheet, WeekProgramKind } from '../../controls/schedule/WeekProgramSheet';
import { parameterLabel } from '../../controls/generic/parameters';
import { Links } from './Links';
import { DevicePrograms } from './DevicePrograms';
import { ComTest } from './ComTest';
import { DeviceHistory } from './DeviceHistory';
import { DeviceSysvars, useDeviceSysvars } from './DeviceSysvars';
import { Firmware } from './Firmware';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';

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
  const { interfaceName, address } = useParams({ from: '/device/$interfaceName/$address' });
  const t = useTranslations();
  const { showToast } = useToast();
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const isAdmin = userLevel === 'admin';
  const canEdit = isAdmin && elevated;
  const [elevating, setElevating] = useState(false);
  const { data: devices, isPending: devicesLoading } = useDevices();
  const names = useChannelNames();
  const putParamset = usePutParamset();
  const pairingAction = usePairingAction();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [scheduleAddress, setScheduleAddress] = useState<string | null>(null);
  const [deleteOptions, setDeleteOptions] = useState({ reset: false, force: false });

  const device = devices?.find((d) => d.address === address && d.interfaceName === interfaceName);
  // Device-wide settings are on the device (BidCos) or its channel 0 (HmIP)
  const addresses = useMemo(() => [address, ...(device?.children ?? [])], [address, device]);

  const descriptions = useQueries({
    queries: addresses.map((a) => ({
      queryKey: ['paramsetDescription', interfaceName, a, 'MASTER'],
      queryFn: async () =>
        ((await request({ type: 'getParamsetDescription', interfaceName, address: a, paramsetKey: 'MASTER' }))
          .description ?? {}) as ParamsetDescription,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const values = useQueries({
    queries: addresses.map((a) => ({
      queryKey: ['paramset', interfaceName, a, 'MASTER'],
      queryFn: async () =>
        ((await request({ type: 'getParamset', interfaceName, address: a, paramsetKey: 'MASTER' })).values ??
          {}) as Values,
      retry: false,
    })),
  });

  // Battery devices only fetch new settings when woken up
  const { data: maintenance } = useParamset(interfaceName, `${address}:0`, 'VALUES', {
    enabled: device?.children?.includes(`${address}:0`) === true,
  });
  const configPending = maintenance?.CONFIG_PENDING === true;

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
    .map((a, i) => ({ address: a, description: descriptions[i].data, current: values[i].data ?? {} }))
    .filter((s): s is { address: string; description: ParamsetDescription; current: Values } =>
      s.description !== undefined && shownParameters(s.description).length > 0,
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
          await putParamset.mutateAsync({ interfaceName, address: s.address, values: draft });
        }
      }
      setDrafts({});
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
        .map((c, index) => ({ index, label: names.get(c.address) ?? c.address })),
    [device, names],
  );
  // The channels come with the device list; until it and every description
  // and value are there, placeholders stand in for the settings
  const loading = devicesLoading || descriptions.some((d) => d.isPending) || values.some((v) => v.isPending);
  const title = names.get(address) ?? address;
  usePageTitle(title);

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
              <span>·</span>
              <WebUILink />
            </div>
          </div>
          {canEdit && device && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleting(true)}
            >
              <TrashIcon />
              {m.DELETE_DEVICE()}
            </Button>
          )}
        </div>
      </div>
      {configPending && <Notice role="status">{m.CONFIG_PENDING()}</Notice>}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {sections.map((s) => {
            const draft = drafts[s.address] ?? {};
            // Device-wide settings: on the device (BidCos) or its channel 0 (HmIP)
            const label =
              s.address === address ||
              (s.address === `${address}:0` && [undefined, s.address].includes(names.get(s.address)))
                ? m.DEVICE_SETTINGS()
                : (names.get(s.address) ?? s.address);
            return (
              <Section key={s.address} aria-label={label}>
                <h2 className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{label}</span>
                  {label !== s.address && (
                    <span className="shrink-0 font-mono text-xs font-normal text-muted-foreground">{s.address}</span>
                  )}
                </h2>
                <GroupedSettings
                  label={`${label} ${s.address}`}
                  description={s.description}
                  values={{ ...s.current, ...draft }}
                  changed={new Set(Object.keys(draft))}
                  readOnly={!canEdit}
                  onSet={(name, value) => setDraft(s.address, s.current, name, value)}
                  onEditWeekProfile={() => setScheduleAddress(s.address)}
                />
              </Section>
            );
          })}
          {loading && <PanelSkeleton lines={6} className="rounded-xl border bg-card p-5" />}
          {!loading && sections.length === 0 && <p className="text-sm text-muted-foreground">{m.NO_SETTINGS()}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          {device && (
            <Section aria-label={m.FIRMWARE()}>
              <h2>{m.FIRMWARE()}</h2>
              <Firmware device={device} canEdit={canEdit} />
            </Section>
          )}
          {canEdit && (
            <Section aria-label={m.NAMES_AND_ROOMS()}>
              <h2>{m.NAMES_AND_ROOMS()}</h2>
              <NamesAndRooms deviceAddress={address} deviceName={title} />
            </Section>
          )}
          {userLevel === 'admin' && device && (
            <Section aria-label={m.COMTEST()}>
              <h2>{m.COMTEST()}</h2>
              <ComTest address={address} />
            </Section>
          )}
          {device && <DeviceSysvarsSection address={address} />}
          {device && (
            <Section aria-label={m.DEVHIST()}>
              <h2>{m.DEVHIST()}</h2>
              <DeviceHistory address={address} />
            </Section>
          )}
          <Section aria-label={m.PROGRAMS()}>
            <h2>{m.PROGRAMS()}</h2>
            <DevicePrograms address={address} />
          </Section>
          {canEdit &&
            device &&
            (device.channels ?? []).some((c) => c.linkSourceRoles?.length || c.linkTargetRoles?.length) && (
              <Section aria-label={m.LINKS()}>
                <h2>{m.LINKS()}</h2>
                <Links interfaceName={interfaceName} deviceAddress={address} channels={device.channels ?? []} />
              </Section>
            )}
        </div>
      </div>

      {canEdit && changes.length > 0 && (
        <div className="sticky bottom-4 animate-in fade-in-0 slide-in-from-bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-background/85 p-3 shadow-lg backdrop-blur-md">
          <span className="mr-auto" />
          <DialogButton type="button" disabled={changes.length === 0} onClick={() => setDrafts({})}>
            {m.RESET()}
          </DialogButton>
          <DialogButton type="button" primary disabled={changes.length === 0} onClick={() => setConfirming(true)}>
            {m.SAVE()} {changes.length > 0 ? `(${changes.length})` : ''}
          </DialogButton>
        </div>
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
              { type: 'deleteDevice', interfaceName, address, ...deleteOptions },
              {
                onSuccess: () => {
                  showToast(m.DELETED(), 'info');
                  navigate({ to: '/setup' });
                },
                onError: (error) => showToast(`${m.CHANGE_FAILED()}: ${error.message}`),
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
                onChange={(event) => setDeleteOptions((prev) => ({ ...prev, [option]: event.target.checked }))}
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
                {formatParameterValue(c.parameter, c.previous, t)} → {formatParameterValue(c.parameter, c.value, t)}
              </li>
            ))}
          </ul>
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
