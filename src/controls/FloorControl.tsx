import styled from '@emotion/styled';
import { FloorClimateControlTransceiverChannel } from 'src/types/types';
import { MdiPipeValve } from '../components/icons/MdiPipeValve';
import { ChannelName } from '../components/ChannelName';
import { getPercentageColor, getPercentageGradient } from '../utils/colors';

interface FloorControlProps {
  channel: FloorClimateControlTransceiverChannel;
}

const Container = styled.div`
  width: 250px;
  padding: 16px;
  border-radius: 12px;
`;

const Content = styled.div`
  padding-top: 12px;
`;

const FlexBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const IconWrapper = styled.div<{ value: number }>`
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));

  &:hover {
    transform: scale(1.1) rotate(5deg);
  }
`;

const ProgressBarContainer = styled.div`
  width: 100%;
  position: relative;
`;

const ProgressBar = styled.div<{ value: number }>`
  height: 18px;
  background: linear-gradient(to right, #e8e8e8, #f0f0f0);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);

  &::after {
    content: '';
    display: block;
    width: ${({ value }) => value}%;
    height: 100%;
    background: ${({ value }) => getPercentageGradient(value)};
    border-radius: 10px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1),
                background 0.4s ease-in-out;
    box-shadow: 0 2px 6px ${({ value }) => getPercentageColor(value)}40;
    position: relative;
    overflow: hidden;
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: ${({ value }) => value}%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    animation: shimmer 2s infinite;
    z-index: 1;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
`;

const Caption = styled.span<{ value: number }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ value }) => getPercentageColor(value)};
  min-width: 40px;
  text-align: right;
  transition: color 0.4s ease-in-out;
  letter-spacing: 0.5px;
`;

export const FloorControl = (props: FloorControlProps) => {
  const value = Math.round(Number(props.channel.datapoints.LEVEL) * 100);

  return (
    <Container>
      <ChannelName name={props.channel.name} maxWidth="250px" />
      <Content>
        <FlexBox>
          <IconWrapper value={value}>
            <MdiPipeValve color={getPercentageColor(value)} width={40} />
          </IconWrapper>
          <ProgressBarContainer>
            <ProgressBar value={value} />
          </ProgressBarContainer>
          <Caption value={value}>{`${value}%`}</Caption>
        </FlexBox>
      </Content>
    </Container>
  );
};
