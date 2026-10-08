import React, { ReactNode } from 'react';
import { EnergyMeterChannel } from '../types/types';
import { cn } from '../lib/utils';
import ZapIcon from '~icons/lucide/zap';
import FlameIcon from '~icons/lucide/flame';
import { defaultLang } from '../i18n/locale';
import { Tile } from '../components/Tile';
import { useEffects } from '../contexts/EffectsContext';
import { m } from '../paraglide/messages';

// All channels of one HmIP-ESI: channel 1 has the current power or gas flow,
// channels 2-4 the meter readings. Which values are set depends on the
// connected sensor, so gas and electricity are detected from the values.
// Also the meter channel of a measuring plug or switch (HmIP-PSM,
// HM-ES-PMSw1): power, energy, and voltage, current and frequency as the
// WebUI shows them (powermeter.fn).
interface EnergyMeterControlProps {
  channels: EnergyMeterChannel[];
}

const Section = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-1">{children}</div>;

const Kind = ({ icon, tint, children }: { icon: ReactNode; tint: string; children: ReactNode }) => (
  <div className="flex items-center gap-2 text-sm font-medium">
    <span className={`flex size-7 items-center justify-center rounded-lg [&_svg]:size-4 ${tint}`}>{icon}</span>
    {children}
  </div>
);

const MainValue = ({ children }: { children: ReactNode }) => (
  <div className="text-3xl font-semibold tracking-tight tabular-nums">{children}</div>
);

const Row = ({ children }: { children: ReactNode }) => (
  <div className="flex justify-between gap-2 text-[13px] text-muted-foreground tabular-nums">{children}</div>
);

const locale = defaultLang === 'de' ? 'de-DE' : 'en-US';

const format = (value: number, maximumFractionDigits: number) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);

// A Ferraris meter: the register with the reading in kWh (the tenths in
// red, as on the real thing) and the disc below, turning the faster the more
// power flows. A real disc turns about once a minute at 1 kW; this one goes
// on a log scale from 1 W to 5 kW so a fridge and a kettle look different.
const FerrarisMeter = ({ power, kwh }: { power: number; kwh: number | undefined }) => {
  const effects = useEffects();
  const turning = power > 0;
  const speed = Math.min(1, Math.max(0, Math.log10(Math.max(1, power)) / Math.log10(5000)));
  const tenths = kwh === undefined ? undefined : Math.floor(kwh * 10);
  const digits = tenths === undefined ? '-----' : String(Math.floor(tenths / 10)).padStart(5, '0');
  return (
    <div
      aria-hidden
      className="flex w-[124px] shrink-0 flex-col items-center gap-2 rounded-[10px] border-[3px] border-zinc-300 bg-zinc-100 px-2 pt-2 pb-2.5 dark:border-zinc-700 dark:bg-zinc-800"
    >
      {/* Register */}
      <div className="flex items-center gap-1">
      <div className="flex gap-px rounded-[4px] bg-zinc-900 p-[3px] font-mono text-[11px] leading-none font-semibold tabular-nums">
        {digits.split('').map((d, i) => (
          <span key={i} className="w-[11px] rounded-[2px] bg-zinc-800 py-[3px] text-center text-zinc-100">
            {d}
          </span>
        ))}
        <span className="w-[11px] rounded-[2px] bg-red-700 py-[3px] text-center text-white">
          {tenths === undefined ? '-' : tenths % 10}
        </span>
      </div>
      <span className="text-[9px] font-semibold text-muted-foreground">kWh</span>
      </div>
      {/* The edge of the disc through its window: notches and the red mark
          pass by, shaded so the edge looks round */}
      <div className="relative h-5 w-full overflow-hidden rounded-[5px] border border-zinc-400 bg-zinc-900 dark:border-zinc-600">
        <div
          className={cn(
            'absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 bg-[linear-gradient(90deg,#ef4444_0_14px,transparent_14px),repeating-linear-gradient(90deg,#9f9fa9_0_1px,#d4d4d8_1px_16px)] bg-[length:160px_100%,16px_100%]',
            turning && effects.on && 'fx-disc',
          )}
          style={{ animationDuration: `${(6 - 5.4 * speed).toFixed(2)}s` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.8),rgba(0,0,0,0.15)_30%,transparent_50%,rgba(0,0,0,0.15)_70%,rgba(0,0,0,0.8))]" />
      </div>
    </div>
  );
};

const channelNumber = (address: string) => Number(address.split(':')[1] ?? 0);

const isSet = (value: number | undefined): value is number => typeof value === 'number' && value > 0;

export const EnergyMeterControl = React.memo(function EnergyMeterControl({ channels }: EnergyMeterControlProps) {
  const sorted = [...channels].sort((a, b) => channelNumber(a.address) - channelNumber(b.address));

  const power = sorted.find((c) => c.datapoints.POWER !== undefined)?.datapoints.POWER;
  const gasFlow = sorted.find((c) => c.datapoints.GAS_FLOW !== undefined)?.datapoints.GAS_FLOW;
  const energyCounters = sorted.filter((c) => isSet(c.datapoints.ENERGY_COUNTER));
  const gasCounters = sorted.filter((c) => isSet(c.datapoints.GAS_VOLUME));

  const value = (datapoint: 'VOLTAGE' | 'CURRENT' | 'FREQUENCY' | 'ENERGY_COUNTER_FEED_IN') =>
    sorted.find((c) => typeof c.datapoints[datapoint] === 'number')?.datapoints[datapoint];
  const voltage = value('VOLTAGE');
  const current = value('CURRENT');
  const frequency = value('FREQUENCY');
  const feedIn = value('ENERGY_COUNTER_FEED_IN');

  // Only the HmIP-ESI has gas values: without them it is electricity, even
  // a new meter at 0 or a plug that is switched off
  const hasGas = gasFlow !== undefined || sorted.some((c) => c.datapoints.GAS_VOLUME !== undefined);
  const isElectricity = hasGas
    ? energyCounters.length > 0 || isSet(power)
    : power !== undefined || sorted.some((c) => c.datapoints.ENERGY_COUNTER !== undefined);
  const isGas = hasGas && (gasCounters.length > 0 || isSet(gasFlow));
  // Meter readings shown: the ones set, or the first one of a new meter
  const readings = energyCounters.length > 0 || hasGas ? energyCounters : sorted.filter((c) => c.datapoints.ENERGY_COUNTER !== undefined).slice(0, 1);

  // Channel names default to "HmIP-ESI <address>"; show the first one
  const name = sorted[0]?.name ?? '';

  return (
    <Tile status={sorted[0]?.status}>
      <div className="flex flex-col gap-3 p-4">
        <div title={name} className="truncate text-[15px] font-medium">
          {name}
        </div>

        {isElectricity && (
          <Section>
            <Kind icon={<ZapIcon />} tint="bg-yellow-500/15 text-yellow-700 dark:text-yellow-300">
              {m.ELECTRICITY()}
            </Kind>
            <div className="flex items-center justify-between gap-3">
              <MainValue>{format(power ?? 0, 0)} W</MainValue>
              <FerrarisMeter
                power={power ?? 0}
                kwh={readings[0] ? (readings[0].datapoints.ENERGY_COUNTER ?? 0) / 1000 : undefined}
              />
            </div>
            {readings.map((channel, index) => (
              <Row key={channel.address}>
                <span>
                  {m.METER_READING()}
                  {index > 0 && ` (${m.CHANNEL()} ${channelNumber(channel.address)})`}
                </span>
                <span>{format((channel.datapoints.ENERGY_COUNTER ?? 0) / 1000, 1)} kWh</span>
              </Row>
            ))}
            {feedIn !== undefined && (
              <Row>
                <span>{m.FEED_IN()}</span>
                <span>{format(feedIn / 1000, 1)} kWh</span>
              </Row>
            )}
            {voltage !== undefined && (
              <Row>
                <span>{m.VOLTAGE()}</span>
                <span>{format(voltage, 1)} V</span>
              </Row>
            )}
            {current !== undefined && (
              <Row>
                <span>{m.ELECTRIC_CURRENT()}</span>
                <span>{format(current, 0)} mA</span>
              </Row>
            )}
            {frequency !== undefined && (
              <Row>
                <span>{m.FREQUENCY()}</span>
                <span>{format(frequency, 1)} Hz</span>
              </Row>
            )}
          </Section>
        )}

        {isGas && (
          <Section>
            <Kind icon={<FlameIcon />} tint="bg-orange-500/15 text-orange-700 dark:text-orange-300">
              {m.GAS()}
            </Kind>
            <MainValue>{format(gasCounters[0]?.datapoints.GAS_VOLUME ?? 0, 2)} m³</MainValue>
            <Row>
              <span>{m.GAS_FLOW()}</span>
              <span>{format(gasFlow ?? 0, 2)} m³/h</span>
            </Row>
          </Section>
        )}

        {!isElectricity && !isGas && <Row>{m.NO_METER_DATA()}</Row>}
      </div>
    </Tile>
  );
});
