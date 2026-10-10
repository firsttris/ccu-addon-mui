import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useChannelList, useDevices, usePutParamset } from '../../queries';
import { RequestError, useWebSocketContext } from '../../hooks/useWebsocket';
import { ElevateDialog } from '../../components/ElevateDialog';
import { useToast } from '../../contexts/ToastContext';
import { usePageTitle } from '../../contexts/PageTitleContext';
import { WeekProfileSheet } from '../../controls/ThermostatControl/profile/WeekProfileSheet';
import { WeekProgramSheet } from '../../controls/schedule/WeekProgramSheet';
import { errorText } from '../../lib/errors';
import { m } from '../../paraglide/messages';
import { Notice } from './SetupShell';
import { Panel } from './Panel';
import { useChannelNames } from './channelNames';
import { Links } from './Links';
import { DevicePrograms } from './DevicePrograms';
import { ComTest } from './ComTest';
import { DeviceHistory } from './DeviceHistory';
import { DeviceSysvars, useDeviceSysvars } from './DeviceSysvars';
import { Firmware } from './Firmware';
import type { DeviceTab } from './deviceTabs';
import {
  changesOf,
  channelCardsOf,
  deviceSectionsOf,
  type Drafts,
  weekProgramKindOf,
  weekProgramTargetsOf,
  withDraft,
} from './device/deviceSettingsModel';
import { useConfigTransfer, useMasterSettings } from './device/useDeviceSettings';
import { DeviceHeader } from './device/DeviceHeader';
import { ChannelsTab } from './device/ChannelsTab';
import { ConfirmChangesDialog, SaveBar } from './device/SaveBar';

// Settings (MASTER paramsets) of a device and its channels. Changes are
// collected first and saved after a confirmation listing old and new
// values. The tabs beside it: links, programs, history and maintenance.
export const DeviceSettings = () => {
  const { interfaceName, address } = useParams({ from: '/device/$interfaceName/$address' });
  const search = useSearch({ from: '/device/$interfaceName/$address' });
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { userLevel, elevated, capabilities } = useWebSocketContext();
  const canEdit = userLevel === 'admin' && elevated;
  const { data: devices, isPending: devicesLoading } = useDevices();
  const { data: allChannels } = useChannelList();
  const names = useChannelNames();
  const putParamset = usePutParamset();
  const [elevating, setElevating] = useState(false);
  // The channel whose settings are pointed at, marked in the picture
  const [activeChannel, setActiveChannel] = useState<string | undefined>();
  const [scheduleAddress, setScheduleAddress] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [confirming, setConfirming] = useState(false);

  const device = devices?.find((d) => d.address === address && d.interfaceName === interfaceName);
  const { sections, pending } = useMasterSettings(interfaceName, address, device);
  const { transfer, configPending, started } = useConfigTransfer(interfaceName, address, device);
  const changes = changesOf(sections, drafts);
  // The channels come with the device list; until it and every description
  // and value are there, placeholders stand in for the settings
  const loading = devicesLoading || pending;
  const title = names.get(address) ?? address;
  usePageTitle(title);

  const save = async () => {
    try {
      for (const s of sections) {
        const draft = drafts[s.address];
        if (draft && Object.keys(draft).length > 0) {
          await putParamset.mutateAsync({ interfaceName, address: s.address, values: draft });
        }
      }
      setDrafts({});
      started();
      showToast(m.SAVED(), 'info');
    } catch (error) {
      if (error instanceof RequestError && error.code === 'ELEVATION_REQUIRED') {
        // The 8 hours are over: ask for the password, keep the changes
        setElevating(true);
      } else {
        showToast(errorText(error, m.SAVE_FAILED));
      }
    } finally {
      setConfirming(false);
    }
  };

  const scheduleType = device?.channels?.find((c) => c.address === scheduleAddress)?.type ?? '';
  const weekProgramKind = weekProgramKindOf(scheduleType);
  const weekProgramTargets = useMemo(() => weekProgramTargetsOf(device, names), [device, names]);

  const hasLinks = (device?.channels ?? []).some((c) => c.linkSourceRoles?.length || c.linkTargetRoles?.length);
  const tabs = [
    { id: 'channels' as const, label: m.DEVICE_TAB_CHANNELS(), shown: true },
    { id: 'links' as const, label: m.LINKS(), shown: canEdit && hasLinks },
    { id: 'programs' as const, label: m.PROGRAMS(), shown: capabilities.programs },
    { id: 'history' as const, label: m.DEVHIST(), shown: !!device && capabilities.history },
    { id: 'maintenance' as const, label: m.DEVICE_TAB_MAINTENANCE(), shown: !!device },
  ].filter((tab) => tab.shown);
  const tab = tabs.some((t) => t.id === search.tab) ? (search.tab as DeviceTab) : 'channels';
  const openTab = (id: DeviceTab) =>
    navigate({
      to: '/device/$interfaceName/$address',
      params: { interfaceName, address },
      search: id === 'channels' ? {} : { tab: id },
      replace: true,
    });

  return (
    <>
      <DeviceHeader
        interfaceName={interfaceName}
        address={address}
        device={device}
        title={title}
        canEdit={canEdit}
        activeChannel={activeChannel}
        tabs={tabs}
        tab={tab}
        onTab={openTab}
      />
      {configPending && transfer === 'none' && <Notice role="status">{m.CONFIG_PENDING()}</Notice>}

      {tab === 'channels' && (
        <ChannelsTab
          address={address}
          title={title}
          deviceType={device?.type}
          cards={channelCardsOf({ address, device, channels: allChannels ?? [], sections, names })}
          deviceSections={deviceSectionsOf(address, sections)}
          loading={loading}
          activeChannel={activeChannel}
          setActiveChannel={setActiveChannel}
          canEdit={canEdit}
          drafts={drafts}
          onSet={(s, name, value) => setDrafts((prev) => withDraft(prev, s.address, s.current, name, value))}
          onEditWeekProfile={setScheduleAddress}
        />
      )}
      {tab === 'links' && device && (
        <div role="tabpanel" aria-label={m.LINKS()}>
          <Panel aria-label={m.LINKS()}>
            <h2>{m.LINKS()}</h2>
            <Links interfaceName={interfaceName} deviceAddress={address} channels={device.channels ?? []} />
          </Panel>
        </div>
      )}
      {tab === 'programs' && (
        <div role="tabpanel" aria-label={m.PROGRAMS()} className="grid items-start gap-5 xl:grid-cols-2">
          <Panel aria-label={m.PROGRAMS()}>
            <h2>{m.PROGRAMS()}</h2>
            <DevicePrograms address={address} />
          </Panel>
          {device && <DeviceSysvarsPanel address={address} />}
        </div>
      )}
      {tab === 'history' && (
        <div role="tabpanel" aria-label={m.DEVHIST()}>
          <Panel aria-label={m.DEVHIST()}>
            <h2>{m.DEVHIST()}</h2>
            <DeviceHistory address={address} />
          </Panel>
        </div>
      )}
      {tab === 'maintenance' && device && (
        <div role="tabpanel" aria-label={m.DEVICE_TAB_MAINTENANCE()} className="grid items-start gap-5 xl:grid-cols-2">
          <Panel aria-label={m.FIRMWARE()}>
            <h2>{m.FIRMWARE()}</h2>
            <Firmware device={device} canEdit={canEdit} />
          </Panel>
          {userLevel === 'admin' && capabilities.comTest && (
            <Panel aria-label={m.COMTEST()}>
              <h2>{m.COMTEST()}</h2>
              <ComTest address={address} />
            </Panel>
          )}
        </div>
      )}

      {canEdit && sections.length > 0 && (tab === 'channels' || changes.length > 0) && (
        <SaveBar
          changes={changes.length}
          transfer={transfer}
          onReset={() => setDrafts({})}
          onSave={() => setConfirming(true)}
        />
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
        <ConfirmChangesDialog
          changes={changes}
          names={names}
          busy={putParamset.isPending}
          onConfirm={save}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
};

// Only with variables assigned to the device's channels
const DeviceSysvarsPanel = ({ address }: { address: string }) => {
  const { assigned, names } = useDeviceSysvars(address);
  if (assigned.length === 0) {
    return null;
  }
  return (
    <Panel aria-label={m.SYSVARS()}>
      <h2>{m.SYSVARS()}</h2>
      <DeviceSysvars assigned={assigned} names={names} />
    </Panel>
  );
};
