import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions, useWebSocketContext } from '../../hooks/useWebsocket';
import { Input } from '../../components/ui/input';
import { NativeSelect } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { PanelSkeleton } from '../../components/ui/skeleton';
import { useToast } from '../../contexts/ToastContext';
import { Panel } from './Panel';
import { m } from '../../paraglide/messages';
import type { EnergyPrice, InfoLed } from '../../types/protocol';
import { errorText } from '../../lib/errors';
import { ToggleRow } from '../../components/ToggleRow';
import { formatNumber } from '../../lib/format';

// Bytes as "2,5 MB"
const formatBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${formatNumber(value, unit === 0 ? 0 : 1)} ${units[unit]}`;
};

// A number as typed: a comma counts as decimal point
const parseNumber = (text: string) => {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null;
};

// The WebUI's general settings (Systemsteuerung → Allgemeine Einstellungen,
// the HMServer's StorageSettingsDialog.ftl): energy prices for the costs of
// energy counters, the CCU3's info LED, beta firmware for devices, and from
// the WebUI's user settings hiding the messages of devices that were
// unreachable (userAccountConfigAdmin.htm). Instead of its microSD card,
// which only its diagrams need, the room the diagram values take.
export const GeneralSettings = () => {
  const { request } = useWebSocketActions();
  const { userLevel, elevated } = useWebSocketContext();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ['generalSettings'],
    queryFn: () => request({ type: 'getGeneralSettings' }),
    enabled: userLevel === 'admin',
    retry: false,
  });
  const [currency, setCurrency] = useState('EUR');
  const [prices, setPrices] = useState({ electricity: '', gas: '', gasHeatingValue: '', gasConditionNumber: '' });
  const [led, setLed] = useState<InfoLed>({ service: true, alarm: true });
  const [hideSticky, setHideSticky] = useState(false);
  const [beta, setBeta] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const p = data.energyPrice;
    setCurrency(p.currency);
    const text = (v: number) => (v ? formatNumber(v, 4) : '');
    setPrices({
      electricity: text(p.electricity),
      gas: text(p.gas),
      gasHeatingValue: text(p.gasHeatingValue),
      gasConditionNumber: text(p.gasConditionNumber),
    });
    setLed(data.infoLed);
    setHideSticky(data.hideStickyUnreach);
    setBeta(data.betaFirmware);
  }, [data]);

  if (userLevel !== 'admin' || isError) return null;
  if (!data) {
    return (
      <Panel aria-label={m.GEN_TITLE()} aria-busy>
        <h2>{m.GEN_TITLE()}</h2>
        <PanelSkeleton lines={4} />
      </Panel>
    );
  }

  const parsed = {
    electricity: prices.electricity.trim() === '' ? 0 : parseNumber(prices.electricity),
    gas: prices.gas.trim() === '' ? 0 : parseNumber(prices.gas),
    gasHeatingValue: prices.gasHeatingValue.trim() === '' ? 0 : parseNumber(prices.gasHeatingValue),
    gasConditionNumber: prices.gasConditionNumber.trim() === '' ? 0 : parseNumber(prices.gasConditionNumber),
  };
  const valid = Object.values(parsed).every((v) => v !== null);

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const energyPrice = { currency, ...(parsed as Omit<EnergyPrice, 'currency'>) };
      await request(
        { type: 'setGeneralSettings', energyPrice, infoLed: led, hideStickyUnreach: hideSticky, betaFirmware: beta },
        { queue: false },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['generalSettings'] }),
        queryClient.invalidateQueries({ queryKey: ['diagrams'] }),
        queryClient.invalidateQueries({ queryKey: ['serviceMessages'] }),
      ]);
      showToast(m.SAVED(), 'info');
    } catch (error) {
      showToast(errorText(error, m.CHANGE_FAILED));
    } finally {
      setBusy(false);
    }
  };

  const disabled = !elevated || busy;
  const priceField = (key: keyof typeof prices, label: string, unit: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          className="w-28"
          aria-label={label}
          aria-invalid={parsed[key] === null}
          disabled={disabled}
          value={prices[key]}
          placeholder="0"
          onChange={(e) => setPrices({ ...prices, [key]: e.target.value })}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
  const { storage } = data;
  const usedShare = storage.total > 0 ? ((storage.total - storage.free) / storage.total) * 100 : 0;

  return (
    <Panel aria-label={m.GEN_TITLE()}>
      <h2>{m.GEN_TITLE()}</h2>

      <h3 className="text-sm font-medium">{m.GEN_ENERGY()}</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{m.GEN_CURRENCY()}</span>
          <NativeSelect
            className="w-24"
            aria-label={m.GEN_CURRENCY()}
            disabled={disabled}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {data.currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </label>
        {priceField('electricity', m.GEN_ELECTRICITY(), `${currency}/kWh`)}
        {priceField('gas', m.GEN_GAS(), `${currency}/kWh`)}
        {priceField('gasHeatingValue', m.GEN_HEATING_VALUE(), 'kWh/m³')}
        {priceField('gasConditionNumber', m.GEN_CONDITION_NUMBER(), '')}
      </div>
      <p className="text-xs">{m.GEN_ENERGY_HINT()}</p>

      <h3 className="mt-2 text-sm font-medium">{m.GEN_DISPLAY()}</h3>
      <div className="flex flex-col gap-3">
        <ToggleRow
          id="led-service"
          label={m.GEN_LED_SERVICE()}
          hint={m.GEN_LED_HINT()}
          checked={led.service}
          disabled={disabled}
          onChange={(on) => setLed({ ...led, service: on })}
        />
        <ToggleRow
          id="led-alarm"
          label={m.GEN_LED_ALARM()}
          hint={m.GEN_LED_HINT()}
          checked={led.alarm}
          disabled={disabled}
          onChange={(on) => setLed({ ...led, alarm: on })}
        />
        <ToggleRow
          id="hide-sticky"
          label={m.GEN_HIDE_STICKY()}
          hint={m.GEN_HIDE_STICKY_HINT()}
          checked={hideSticky}
          disabled={disabled}
          onChange={setHideSticky}
        />
        <ToggleRow
          id="beta-firmware"
          label={m.GEN_BETA()}
          hint={m.GEN_BETA_HINT()}
          checked={beta}
          disabled={disabled}
          onChange={setBeta}
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" disabled={disabled || !valid} onClick={save}>
          {m.SAVE()}
        </Button>
      </div>

      <h3 className="mt-2 text-sm font-medium">{m.GEN_STORAGE()}</h3>
      <div className="flex flex-col gap-1.5 text-sm">
        {/* biome-ignore lint/a11y/useSemanticElements: drawn by the app; the native meter draws itself */}
        <div
          className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label={m.GEN_STORAGE()}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usedShare)}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${usedShare}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {m.GEN_STORAGE_FREE({ free: formatBytes(storage.free), total: formatBytes(storage.total) })} ·{' '}
          {m.GEN_STORAGE_DIAGRAMS({ used: formatBytes(storage.used) })}
        </span>
      </div>
    </Panel>
  );
};
