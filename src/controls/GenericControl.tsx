import styled from '@emotion/styled';
import { DatapointValue, GenericChannel } from '../types/types';
import { defaultLang, useTranslations } from '../i18n/utils';
import { WebUILink } from '../components/WebUILink';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  padding: 10px;
  width: 200px;
  box-sizing: border-box;
`;

const Name = styled.div`
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  overflow-wrap: anywhere;
  color: ${(props) => props.theme.colors.text};
`;

const Datapoints = styled.dl`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 8px;
  margin: 0;
  font-size: 12px;
`;

const Key = styled.dt`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${(props) => props.theme.colors.textSecondary};
`;

const Value = styled.dd`
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: ${(props) => props.theme.colors.text};
`;

const Footer = styled.div`
  margin-top: 8px;
  text-align: right;
`;

const numberFormat = new Intl.NumberFormat(defaultLang, { maximumFractionDigits: 2 });

interface ControlProps {
  channel: GenericChannel;
}

// Fallback for channel types without their own control: shows the channel's
// datapoints read-only, so every device at least appears with its values.
export const GenericControl = ({ channel }: ControlProps) => {
  const t = useTranslations();

  const format = (value: DatapointValue) => {
    if (value === null || value === '') {
      return '–';
    }
    if (typeof value === 'boolean') {
      return value ? t('YES') : t('NO');
    }
    if (typeof value === 'number') {
      return numberFormat.format(value);
    }
    return value;
  };

  const datapoints = Object.entries(channel.datapoints).sort(([a], [b]) => a.localeCompare(b));

  return (
    <Container>
      <Name>{channel.name}</Name>
      <Datapoints aria-label={channel.name}>
        {datapoints.map(([key, value]) => (
          <div key={key} style={{ display: 'contents' }}>
            <Key title={key}>{key}</Key>
            <Value>{format(value)}</Value>
          </div>
        ))}
      </Datapoints>
      <Footer>
        <WebUILink />
      </Footer>
    </Container>
  );
};
