import React from 'react';
import styled from '@emotion/styled';
import { EnergyMeterChannel } from '../types/types';
import { defaultLang } from '../i18n/utils';
import { m } from '../paraglide/messages';

// All channels of one HmIP-ESI: channel 1 has the current power or gas flow,
// channels 2-4 the meter readings. Which values are set depends on the
// connected sensor, so gas and electricity are detected from the values.
interface EnergyMeterControlProps {
  channels: EnergyMeterChannel[];
}

const Container = styled.div`
  width: 230px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: ${(props) => props.theme.colors.text};
`;

const Name = styled.div`
  font-size: 13px;
  text-align: center;
  color: ${(props) => props.theme.colors.textSecondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Kind = styled.div`
  font-size: 15px;
  font-weight: 600;
`;

const MainValue = styled.div`
  font-size: 30px;
  font-weight: 300;
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  color: ${(props) => props.theme.colors.textSecondary};
`;

const locale = defaultLang === 'de' ? 'de-DE' : 'en-US';

const format = (value: number, maximumFractionDigits: number) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);

const channelNumber = (address: string) => Number(address.split(':')[1] ?? 0);

const isSet = (value: number | undefined): value is number =>
  typeof value === 'number' && value > 0;

export const EnergyMeterControl = React.memo(function EnergyMeterControl({
  channels,
}: EnergyMeterControlProps) {
  const sorted = [...channels].sort((a, b) => channelNumber(a.address) - channelNumber(b.address));

  const power = sorted.find((c) => c.datapoints.POWER !== undefined)?.datapoints.POWER;
  const gasFlow = sorted.find((c) => c.datapoints.GAS_FLOW !== undefined)?.datapoints.GAS_FLOW;
  const energyCounters = sorted.filter((c) => isSet(c.datapoints.ENERGY_COUNTER));
  const gasCounters = sorted.filter((c) => isSet(c.datapoints.GAS_VOLUME));

  const isElectricity = energyCounters.length > 0 || isSet(power);
  const isGas = gasCounters.length > 0 || isSet(gasFlow);

  // Channel names default to "HmIP-ESI <address>"; show the first one
  const name = sorted[0]?.name ?? '';

  return (
    <Container>
      <Name title={name}>{name}</Name>

      {isElectricity && (
        <Section>
          <Kind>⚡ {m.ELECTRICITY()}</Kind>
          <MainValue>{format(power ?? 0, 0)} W</MainValue>
          {energyCounters.map((channel, index) => (
            <Row key={channel.address}>
              <span>
                {m.METER_READING()}
                {index > 0 && ` (${m.CHANNEL()} ${channelNumber(channel.address)})`}
              </span>
              <span>{format((channel.datapoints.ENERGY_COUNTER ?? 0) / 1000, 1)} kWh</span>
            </Row>
          ))}
        </Section>
      )}

      {isGas && (
        <Section>
          <Kind>🔥 {m.GAS()}</Kind>
          <MainValue>
            {format(gasCounters[0]?.datapoints.GAS_VOLUME ?? 0, 2)} m³
          </MainValue>
          <Row>
            <span>{m.GAS_FLOW()}</span>
            <span>{format(gasFlow ?? 0, 2)} m³/h</span>
          </Row>
        </Section>
      )}

      {!isElectricity && !isGas && <Row>{m.NO_METER_DATA()}</Row>}
    </Container>
  );
});
