import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useParamset } from '../../../queries';
import { useWebSocketActions } from '../../../hooks/useWebsocket';
import type { Device, ParamsetDescription } from '../../../types/types';
import { shownParameters } from '../../../controls/generic/ParamsetView';
import { type SettingsSection, transferOf, type Values, SENDING_MS, WATCH_MS } from './deviceSettingsModel';

// The MASTER paramsets of the device and its channels: those with settings
// to show, and whether some are still loading
export const useMasterSettings = (interfaceName: string, address: string, device: Device | undefined) => {
  const { request } = useWebSocketActions();
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
  const sections = addresses
    .map((a, i) => ({ address: a, description: descriptions[i].data, current: values[i].data ?? {} }))
    .filter((s): s is SettingsSection => s.description !== undefined && shownParameters(s.description).length > 0);
  const pending = descriptions.some((d) => d.isPending) || values.some((v) => v.isPending);
  return { sections, pending };
};

// The transfer of saved settings to the device. CONFIG_PENDING (channel 0)
// tells it, so it is watched for two minutes after saving.
export const useConfigTransfer = (interfaceName: string, address: string, device: Device | undefined) => {
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const watching = since !== null && now - since < WATCH_MS;
  // Renders again when "sending" turns into "done" and when watching ends,
  // not every second
  useEffect(() => {
    if (since === null) return;
    const timers = [SENDING_MS, WATCH_MS].map((ms) => setTimeout(() => setNow(Date.now()), since + ms - Date.now()));
    return () => timers.forEach(clearTimeout);
  }, [since]);
  const hasMaintenance = device?.children?.includes(`${address}:0`) === true;
  const { data: maintenance } = useParamset(interfaceName, `${address}:0`, 'VALUES', {
    enabled: hasMaintenance,
    refetchInterval: watching ? 2000 : false,
  });
  const configPending =
    hasMaintenance && maintenance?.CONFIG_PENDING !== undefined ? maintenance.CONFIG_PENDING === true : undefined;
  return {
    transfer: transferOf({ since, now, configPending }),
    configPending: configPending === true,
    // Saved: watch the transfer from now on
    started: () => {
      setSince(Date.now());
      setNow(Date.now());
    },
  };
};
