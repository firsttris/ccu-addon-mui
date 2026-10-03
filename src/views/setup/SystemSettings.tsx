import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MapPinIcon from '~icons/lucide/map-pin';
import LocateIcon from '~icons/lucide/locate-fixed';
import RotateCwIcon from '~icons/lucide/rotate-cw';
import PowerIcon from '~icons/lucide/power';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { WebUILink } from '../../components/WebUILink';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../contexts/ToastContext';
import { Panel } from './Panel';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';

const useSystemSettings = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => request({ type: 'getSystemSettings' }),
    refetchInterval: 60000,
    retry: false,
  });
};

// "UTC+1", "UTC−3:30" from minutes east of UTC
export const formatOffset = (minutes: number) => {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
};

// A coordinate as typed: a comma counts as decimal point
export const parseCoordinate = (text: string, limit: number) => {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
};

// Location (for sunrise and sunset in programs) and clock, as the WebUI's
// "Zeit-/Positionseinstellungen" (cp_time.cgi), and restarting or shutting
// down the CCU, as its "CCU-Wartung" (cp_maintenance.cgi).
export const SystemSettings = () => {
  const { userLevel } = useWebSocketContext();
  if (userLevel !== 'admin') {
    return null;
  }
  return (
    <>
      <Location />
      <Power />
    </>
  );
};

const Location = () => {
  const { request } = useWebSocketActions();
  const { elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isError } = useSystemSettings();
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setLatitude(String(data.latitude));
      setLongitude(String(data.longitude));
    }
  }, [data]);

  if (isError) {
    return null;
  }
  if (!data) {
    return (
      <Panel aria-label={m.SYS_LOCATION()} aria-busy>
        <h2>{m.SYS_LOCATION()}</h2>
        <PanelSkeleton lines={3} />
      </Panel>
    );
  }
  const lat = parseCoordinate(latitude, 90);
  const lon = parseCoordinate(longitude, 180);
  const changed = lat !== null && lon !== null && (lat !== data.latitude || lon !== data.longitude);

  const save = async () => {
    if (lat === null || lon === null) return;
    setBusy(true);
    try {
      await request({ type: 'setLocation', latitude: lat, longitude: lon }, { queue: false });
      await queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      showToast(m.SAVED(), 'info');
    } catch (error) {
      showToast(`${m.CHANGE_FAILED()}: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setLatitude(String(Math.round(position.coords.latitude * 1e4) / 1e4));
        setLongitude(String(Math.round(position.coords.longitude * 1e4) / 1e4));
      },
      () => showToast(m.SYS_LOCATE_FAILED()),
    );

  return (
    <Panel aria-label={m.SYS_LOCATION()}>
      <h2>{m.SYS_LOCATION()}</h2>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{m.SYS_CCU_TIME()}</dt>
        <dd className="tabular-nums">
          {data.time} ({formatOffset(data.timeZoneOffset)}
          {data.timeZone ? `, ${data.timeZone}` : ''})
        </dd>
        {data.city && (
          <>
            <dt className="text-muted-foreground">{m.SYS_CITY()}</dt>
            <dd>{data.city}</dd>
          </>
        )}
      </dl>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && !busy) save();
        }}
      >
        {[
          {
            label: m.SYS_LATITUDE(),
            value: latitude,
            set: setLatitude,
            valid: lat !== null,
          },
          {
            label: m.SYS_LONGITUDE(),
            value: longitude,
            set: setLongitude,
            valid: lon !== null,
          },
        ].map((field) => (
          <label key={field.label} className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{field.label}</span>
            <Input
              className="h-9 w-36 tabular-nums"
              inputMode="decimal"
              aria-label={field.label}
              aria-invalid={!field.valid}
              disabled={!elevated}
              value={field.value}
              onChange={(event) => field.set(event.target.value)}
            />
          </label>
        ))}
        {'geolocation' in navigator && (
          <Button type="button" variant="outline" disabled={!elevated} onClick={locate}>
            <LocateIcon />
            {m.SYS_LOCATE()}
          </Button>
        )}
        <Button type="submit" disabled={!elevated || !changed || busy}>
          <MapPinIcon />
          {m.SAVE()}
        </Button>
      </form>
      <p className="text-xs">{m.SYS_LOCATION_HINT()}</p>
    </Panel>
  );
};

const Power = () => {
  const { request } = useWebSocketActions();
  const { elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const { data } = useSystemSettings();
  const [asking, setAsking] = useState<'reboot' | 'shutdown' | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) {
    return null;
  }

  const run = async (action: 'reboot' | 'shutdown') => {
    setBusy(true);
    try {
      await request({ type: 'powerAction', action }, { queue: false });
      showToast(action === 'reboot' ? m.SYS_REBOOTING() : m.SYS_SHUTTING_DOWN(), 'info');
      setAsking(null);
    } catch (error) {
      showToast(`${m.CHANGE_FAILED()}: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel aria-label={m.SYS_MAINTENANCE()}>
      <h2>{m.SYS_MAINTENANCE()}</h2>
      {data.canPower ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" disabled={!elevated} onClick={() => setAsking('reboot')}>
            <RotateCwIcon />
            {m.SYS_REBOOT()}
          </Button>
          <Button type="button" variant="outline" disabled={!elevated} onClick={() => setAsking('shutdown')}>
            <PowerIcon />
            {m.SYS_SHUTDOWN()}
          </Button>
        </div>
      ) : (
        <p className="text-xs">
          {m.SYS_POWER_UNAVAILABLE()} <WebUILink />
        </p>
      )}
      {asking && (
        <ConfirmDialog
          title={asking === 'reboot' ? m.SYS_REBOOT() : m.SYS_SHUTDOWN()}
          confirmLabel={asking === 'reboot' ? m.SYS_REBOOT() : m.SYS_SHUTDOWN()}
          destructive
          busy={busy}
          onConfirm={() => run(asking)}
          onCancel={() => setAsking(null)}
        >
          {asking === 'reboot' ? m.SYS_REBOOT_CONFIRM() : m.SYS_SHUTDOWN_CONFIRM()}
        </ConfirmDialog>
      )}
    </Panel>
  );
};
