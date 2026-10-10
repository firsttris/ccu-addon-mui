import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DownloadIcon from '~icons/lucide/download';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { m } from '../../paraglide/messages';
import { OnlyOnCCU, Panel } from './Panel';
import { errorText } from '../../lib/errors';
import { download } from './Backup';

// The levels the WebUI offers (cp_maintenance.cgi: LOGLEVELS,
// HMIP_LOGLEVELS, REGA_LOGLEVELS), most verbose first
const rfdLevels = () => [
  { value: 1, label: m.LOG_ALL() },
  { value: 2, label: m.LOG_INFO() },
  { value: 4, label: m.LOG_WARNINGS() },
  { value: 5, label: m.LOG_ERRORS() },
];
const hmipLevels = () => [
  { value: 'TRACE', label: m.LOG_TRACE() },
  { value: 'DEBUG', label: m.LOG_ALL() },
  { value: 'INFO', label: m.LOG_INFO() },
  { value: 'WARN', label: m.LOG_WARNINGS() },
  { value: 'ERROR', label: m.LOG_ERRORS() },
];
const regaLevels = () => [
  { value: 0, label: m.LOG_ALL() },
  { value: 1, label: m.LOG_INFO() },
  { value: 2, label: m.LOG_ERRORS() },
  { value: 3, label: m.LOG_NONE() },
];

// A syslog server as set_log_config writes it: host name, IPv4 or IPv6
export const validLogHost = (host: string) => /^[A-Za-z0-9.:[\]_-]{0,253}$/.test(host);

// The logging settings of the WebUI's Zentralen-Wartung: how much the
// HomeMatic IP server, rfd (BidCos-RF) and the logic layer log, where to
// send the log, and the log files to download. Only on the CCU itself.
export const Logging = () => {
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({
    queryKey: ['logging'],
    queryFn: () => request({ type: 'getLogging' }),
    enabled: userLevel === 'admin',
    retry: false,
  });
  const [draft, setDraft] = useState({ host: '', rfd: 2, hmip: 'ERROR', rega: 2 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setDraft({ host: data.host, rfd: data.rfd, hmip: data.hmip, rega: data.rega });
  }, [data]);

  if (userLevel !== 'admin') {
    return null;
  }
  if (isError) {
    return <OnlyOnCCU title={m.LOG_TITLE()} />;
  }
  if (isPending) {
    return (
      <Panel aria-label={m.LOG_TITLE()} aria-busy>
        <h2>{m.LOG_TITLE()}</h2>
        <PanelSkeleton lines={4} />
      </Panel>
    );
  }
  const changed =
    draft.host !== data.host || draft.rfd !== data.rfd || draft.hmip !== data.hmip || draft.rega !== data.rega;
  const hostValid = validLogHost(draft.host.trim());

  const save = async () => {
    setBusy(true);
    try {
      await request({ type: 'setLogging', ...draft, host: draft.host.trim() }, { queue: false });
      await queryClient.invalidateQueries({ queryKey: ['logging'] });
      showToast(m.SAVED(), 'info');
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  const downloadLogs = async () => {
    try {
      const response = await request({ type: 'downloadLogs' }, { queue: false });
      download(response.url, response.fileName);
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    }
  };

  const select = <T extends string | number>(
    label: string,
    value: T,
    options: { value: T; label: string }[],
    set: (value: T) => void,
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <NativeSelect
        className="w-44"
        aria-label={label}
        disabled={!elevated}
        value={String(value)}
        onChange={(event) => {
          const option = options.find((o) => String(o.value) === event.target.value);
          if (option) set(option.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  );

  return (
    <Panel aria-label={m.LOG_TITLE()}>
      <h2>{m.LOG_TITLE()}</h2>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && hostValid && !busy) save();
        }}
      >
        {select('HomeMatic IP', draft.hmip, hmipLevels(), (hmip) => setDraft({ ...draft, hmip }))}
        {select('BidCos-RF', draft.rfd, rfdLevels(), (rfd) => setDraft({ ...draft, rfd }))}
        {select(m.LOG_LOGIC(), draft.rega, regaLevels(), (rega) => setDraft({ ...draft, rega }))}
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.LOG_HOST()}</span>
          <Input
            className="h-9 w-52"
            aria-label={m.LOG_HOST()}
            aria-invalid={!hostValid}
            disabled={!elevated}
            value={draft.host}
            onChange={(event) => setDraft({ ...draft, host: event.target.value })}
          />
        </label>
        <Button type="submit" disabled={!elevated || !changed || !hostValid || busy}>
          {m.SAVE()}
        </Button>
      </form>
      <div>
        <Button type="button" variant="outline" disabled={!elevated} onClick={downloadLogs}>
          <DownloadIcon />
          {m.LOG_DOWNLOAD()}
        </Button>
      </div>
      <p className="text-xs">{m.LOG_HINT()}</p>
    </Panel>
  );
};
