import styled from '@emotion/styled';
import { HeaderIcon } from '../components/StyledIcons';
import { ChannelHeader } from '../components/ChannelHeader';
import { FloorClimateControlTransceiverChannel } from 'src/types/types';

interface FloorControlProps {
  channel: FloorClimateControlTransceiverChannel;
}

const Container = styled.div`
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 16px;
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
  height: 4px;
  background-color: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    width: ${({ value }) => value}%;
    height: 100%;
    background-color: #3f51b5;
  }
`;

const Caption = styled.span`
  font-size: 12px;
  color: #757575;
`;

export const FloorControl = (props: FloorControlProps) => {
  const value = Math.round(Number(props.channel.datapoints.LEVEL) * 100);

  const getColor = (value: number): string => {
    if (value === 0) {
      return 'black';
    } else if (value >= 0 && value < 25) {
      return 'blue';
    } else if (value >= 25 && value < 50) {
      return 'orange';
    } else if (value >= 50 && value < 75) {
      return 'red';
    } else if (value >= 75 && value <= 100) {
      return 'purple';
    } else {
      return 'black';
    }
  };

  return (
    <Container>
      <ChannelHeader icon="mdi:radiator-coil" name={props.channel.name}/>
      <Content>
        <FlexBox>
          <HeaderIcon icon="mdi:pipe-valve" style={{ marginRight: '5px'}} color={getColor(value)}/>
          <ProgressBarContainer>
            <ProgressBar value={value} />
          </ProgressBarContainer>
          <Caption>{`${value}%`}</Caption>
        </FlexBox>
      </Content>
    </Container>
  );
};