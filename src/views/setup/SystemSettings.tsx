import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MapPinIcon from '~icons/lucide/map-pin';
import LocateIcon from '~icons/lucide/locate-fixed';
import RotateCwIcon from '~icons/lucide/rotate-cw';
import PowerIcon from '~icons/lucide/power';
import ShieldIcon from '~icons/lucide/shield';
import ClockIcon from '~icons/lucide/clock';
import { NativeSelect } from '../../components/ui/select';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { WebUILink } from '../../components/WebUILink';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { useToast } from '../../contexts/ToastContext';
import { Panel } from './Panel';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { m } from '../../paraglide/messages';
import { errorText } from '../../lib/errors';

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
  if (userLevel === '') {
    // Not logged in yet: the cards come once the level is known
    return (
      <>
        {[m.SYS_LOCATION(), m.SYS_MAINTENANCE()].map((title) => (
          <Panel key={title} aria-label={title} aria-busy>
            <h2>{title}</h2>
            <PanelSkeleton lines={2} />
          </Panel>
        ))}
      </>
    );
  }
  if (userLevel !== 'admin') {
    return null;
  }
  return (
    <>
      <Location />
      <Clock />
      <Power />
      <RegaVersion />
    </>
  );
};

// "2026-10-04 12:30:00" for the CCU from a date (local time)
export const formatClock = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

// Time zone, time servers and setting the clock by hand, as the WebUI's
// "Zeit-/Positionseinstellungen" (cp_time.cgi): only what the CCU has files
// for; the clock only where the add-on runs on the CCU
export const Clock = () => {
  const { request } = useWebSocketActions();
  const { elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useSystemSettings();
  const [zone, setZone] = useState('');
  const [servers, setServers] = useState('');
  // Set by hand: starts at this device's time, to the minute
  const [clock, setClock] = useState(() => formatClock(new Date()).slice(0, 16).replace(' ', 'T'));
  const [busy, setBusy] = useState(false);

  // Each field only when its stored value changes, see Location
  useEffect(() => setZone(data?.timeZone ?? ''), [data?.timeZone]);
  useEffect(() => setServers(data?.timeServers ?? ''), [data?.timeServers]);

  if (!data || (data.timeServers === undefined && !data.timeZones && !data.canSetClock)) {
    return null;
  }

  const save = async (message: Parameters<typeof request>[0], success = m.SAVED()) => {
    setBusy(true);
    try {
      await request(message, { queue: false });
      await queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      showToast(success, 'info');
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  const row = 'flex flex-wrap items-end gap-3';
  const label = 'flex flex-col gap-1';
  const caption = 'text-xs text-muted-foreground';
  return (
    <Panel aria-label={m.SYS_CLOCK()}>
      <h2>{m.SYS_CLOCK()}</h2>
      {data.timeZones && (
        <div className={row}>
          <label className={label}>
            <span className={caption}>{m.SYS_TIME_ZONE()}</span>
            <NativeSelect
              className="w-60"
              aria-label={m.SYS_TIME_ZONE()}
              disabled={!elevated}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              {!data.timeZones.includes(zone) && <option value={zone}>{zone || '–'}</option>}
              {data.timeZones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!elevated || busy || zone === (data.timeZone ?? '') || !data.timeZones.includes(zone)}
            onClick={() => save({ type: 'setTimeZone', timeZone: zone })}
          >
            {m.SYS_TIME_ZONE_SAVE()}
          </Button>
        </div>
      )}
      {data.timeServers !== undefined && (
        <form
          className={row}
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && servers.trim() !== data.timeServers) save({ type: 'setTimeServers', servers });
          }}
        >
          <label className={label}>
            <span className={caption}>{m.SYS_TIME_SERVERS()}</span>
            <Input
              className="h-9 w-72"
              aria-label={m.SYS_TIME_SERVERS()}
              disabled={!elevated}
              value={servers}
              onChange={(e) => setServers(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={!elevated || busy || servers.trim() === data.timeServers}>
            {m.SYS_TIME_SERVERS_SAVE()}
          </Button>
        </form>
      )}
      {data.canSetClock && (
        <form
          className={row}
          onSubmit={(event) => {
            event.preventDefault();
            if (clock) save({ type: 'setClock', time: `${clock.replace('T', ' ')}:00`.slice(0, 19) }, m.SYS_CLOCK_SET());
          }}
        >
          <label className={label}>
            <span className={caption}>{m.SYS_CLOCK_DATE_TIME()}</span>
            <Input
              type="datetime-local"
              className="h-9 w-56 tabular-nums"
              aria-label={m.SYS_CLOCK_DATE_TIME()}
              disabled={!elevated}
              value={clock}
              onChange={(e) => setClock(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={!elevated || busy || !clock}>
            {m.SYS_CLOCK_SET_MANUAL()}
          </Button>
        </form>
      )}
      {data.canSetClock && (
        <div className={row}>
          <Button
            type="button"
            variant="outline"
            disabled={!elevated || busy}
            onClick={() => save({ type: 'setClock', time: formatClock(new Date()) }, m.SYS_CLOCK_SET())}
          >
            <ClockIcon />
            {m.SYS_CLOCK_FROM_BROWSER()}
          </Button>
        </div>
      )}
      <p className="text-xs">{m.SYS_CLOCK_HINT()}</p>
    </Panel>
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

  // Only when the stored values change: refetching (every minute, after
  // saving another card) must not overwrite what is being typed
  useEffect(() => {
    if (data) setLatitude(String(data.latitude));
  }, [data?.latitude]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (data) setLongitude(String(data.longitude));
  }, [data?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

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
      showToast(errorText(error, m.CHANGE_FAILED));
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

// The safe mode as the WebUI's maintenance page (cp_maintenance.cgi:
// OnEnterSafeMode, SafeMode.enter)
type Action = 'reboot' | 'shutdown' | 'safemode';
const labels: Record<Action, { title: () => string; confirm: () => string; done: () => string }> = {
  reboot: { title: m.SYS_REBOOT, confirm: m.SYS_REBOOT_CONFIRM, done: m.SYS_REBOOTING },
  shutdown: { title: m.SYS_SHUTDOWN, confirm: m.SYS_SHUTDOWN_CONFIRM, done: m.SYS_SHUTTING_DOWN },
  safemode: { title: m.SYS_SAFE_MODE, confirm: m.SYS_SAFE_MODE_CONFIRM, done: m.SYS_SAFE_MODE_STARTING },
};

export const Power = () => {
  const { request } = useWebSocketActions();
  const { elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const { data } = useSystemSettings();
  const [asking, setAsking] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) {
    return null;
  }

  const run = async (action: Action) => {
    setBusy(true);
    try {
      await request({ type: 'powerAction', action }, { queue: false });
      showToast(labels[action].done(), 'info');
      setAsking(null);
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
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
          <Button type="button" variant="outline" disabled={!elevated} onClick={() => setAsking('safemode')}>
            <ShieldIcon />
            {m.SYS_SAFE_MODE()}
          </Button>
        </div>
      ) : (
        <p className="text-xs">
          {m.SYS_POWER_UNAVAILABLE()} <WebUILink />
        </p>
      )}
      {asking && (
        <ConfirmDialog
          title={labels[asking].title()}
          confirmLabel={labels[asking].title()}
          destructive
          busy={busy}
          onConfirm={() => run(asking)}
          onCancel={() => setAsking(null)}
        >
          {labels[asking].confirm()}
        </ConfirmDialog>
      )}
    </Panel>
  );
};

// The logic layer, where the CCU has both (the eQ-3 firmware's maintenance
// page: User.getReGaVersion, User.setReGaVersion, then the question
// whether to restart now, dialogRestart2ChanceReGaVersion)
type RegaVersionValue = 'NORMAL' | 'COMMUNITY';

export const RegaVersion = () => {
  const { request } = useWebSocketActions();
  const { elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useSystemSettings();
  const [version, setVersion] = useState<RegaVersionValue | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [askRestart, setAskRestart] = useState(false);

  if (!data?.regaVersion) {
    return null;
  }
  const chosen = version ?? data.regaVersion;

  const save = async () => {
    setBusy(true);
    try {
      await request({ type: 'setRegaVersion', version: chosen });
      await queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      setAskRestart(true);
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  const restart = async () => {
    setBusy(true);
    try {
      await request({ type: 'powerAction', action: 'reboot' }, { queue: false });
      showToast(m.SYS_REBOOTING(), 'info');
      setAskRestart(false);
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel aria-label={m.SYS_REGA()}>
      <h2>{m.SYS_REGA()}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.SYS_REGA_VERSION()}</span>
          <NativeSelect
            className="w-60"
            aria-label={m.SYS_REGA_VERSION()}
            disabled={!elevated}
            value={chosen}
            onChange={(e) => setVersion(e.target.value as RegaVersionValue)}
          >
            <option value="COMMUNITY">{m.SYS_REGA_COMMUNITY()}</option>
            <option value="NORMAL">{m.SYS_REGA_NORMAL()}</option>
          </NativeSelect>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!elevated || busy || chosen === data.regaVersion}
          onClick={save}
        >
          {m.SAVE()}
        </Button>
      </div>
      <p className="text-xs">{m.SYS_REGA_HINT()}</p>
      {askRestart && (
        <ConfirmDialog
          title={m.SYS_REBOOT()}
          confirmLabel={m.SYS_REGA_RESTART_NOW()}
          cancelLabel={m.SYS_REGA_RESTART_LATER()}
          busy={busy}
          onConfirm={restart}
          onCancel={() => setAskRestart(false)}
        >
          {m.SYS_REGA_RESTART()}
        </ConfirmDialog>
      )}
    </Panel>
  );
};
