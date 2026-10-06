import React, { ReactNode } from 'react';
import { EnergyMeterChannel } from '../types/types';
import ZapIcon from '~icons/lucide/zap';
import FlameIcon from '~icons/lucide/flame';
import { defaultLang } from '../i18n/locale';
import { Tile } from '../components/Tile';
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
            <MainValue>{format(power ?? 0, 0)} W</MainValue>
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
