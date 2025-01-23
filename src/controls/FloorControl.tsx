import styled from '@emotion/styled';
import { ChannelHeader } from '../components/ChannelHeader';
import { FloorClimateControlTransceiverChannel } from 'src/types/types';
import { MdiRadiatorCoil } from '../components/icons/MdiRadiatorCoil';
import { MdiPipeValve } from '../components/icons/MdiPipeValve';

interface FloorControlProps {
  channel: FloorClimateControlTransceiverChannel;
}

const Container = styled.div`
  width: 250px;
  padding: 10px;
`;

const Content = styled.div`
  padding-top: 0px;
`;

const FlexBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  margin-right: 8px;
`;

const ProgressBar = styled.div<{ value: number }>`
  height: 14px;
  background-color: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    width: ${({ value }) => value}%;
    height: 100%;
    background-color: ${({ value }) => getColor(value)};
  }
`;

const Caption = styled.span`
  font-size: 12px;
  color: #757575;
`;

const getColor = (value: number): string => {
  if (value === 0) {
    return '#3498DB'; // Blau für niedrigen Durchfluss
  } else if (value > 0 && value < 25) {
    return '#2ECC71'; // Grün für mittleren Durchfluss
  } else if (value >= 25 && value < 50) {
    return '#F1C40F'; // Gelb für erhöhten Durchfluss
  } else if (value >= 50 && value < 75) {
    return '#E67E22'; // Orange für hohen Durchfluss
  } else if (value >= 75 && value <= 100) {
    return '#E74C3C'; // Rot für sehr hohen Durchfluss
  } else {
    return '#3498DB'; // Standardfarbe Blau
  }
};

export const FloorControl = (props: FloorControlProps) => {
  const value = Math.round(Number(props.channel.datapoints.LEVEL) * 100);

  return (
    <Container>
      <ChannelHeader icon={<MdiRadiatorCoil width={40} />} name={props.channel.name}/>
      <Content>
        <FlexBox>
        <MdiPipeValve color={getColor(value)} style={{ marginRight: '5px'}} width={40}/>
          <ProgressBarContainer>
            <ProgressBar value={value} />
          </ProgressBarContainer>
          <Caption>{`${value}%`}</Caption>
        </FlexBox>
      </Content>
    </Container>
  );
};