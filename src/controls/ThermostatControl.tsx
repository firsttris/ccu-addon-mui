import styled from '@emotion/styled';
import { HeatingClimateControlTransceiverChannel } from 'src/types/types';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { MdiMinus } from '../components/icons/MdiMinus';
import { MdiPlus } from '../components/icons/MdiPlus';
import { ChannelName } from '../components/ChannelName';
import { MaterialSymbolsLightWindowOpen } from '../components/icons/MaterialSymbolsLightWindowOpen';
import { MaterialSymbolsLightWindowClosed } from '../components/icons/MaterialSymbolsLightWindowClosed';
import { useState, useRef, useEffect, useCallback } from 'react';
import { MdiLeaf } from '../components/icons/MdiLeaf';
import { MdiFlame } from '../components/icons/MdiFlame';
import { MdiPowerStandby } from '../components/icons/MdiPowerStandby';

type ThermostatProps = {
  channel: HeatingClimateControlTransceiverChannel;
};

const Container = styled.div`
  position: relative;
  width: 300px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--card-background-color, #fff);
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const Header = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 4px;
`;

const StatusIcons = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const getColor = (temperature: number) => {
  // Improved color gradient with smoother transitions
  if (temperature < 10) return '#0288D1'; // Deep Blue
  if (temperature < 14) return '#03A9F4'; // Light Blue
  if (temperature < 17) return '#00BCD4'; // Cyan
  if (temperature < 19) return '#26A69A'; // Teal
  if (temperature < 21) return '#66BB6A'; // Green
  if (temperature < 23) return '#9CCC65'; // Light Green
  if (temperature < 25) return '#FFA726'; // Orange
  if (temperature < 27) return '#FF7043'; // Deep Orange
  return '#EF5350'; // Red
};


const ThermostatWrapper = styled.div`
  position: relative;
  width: 260px;
  height: 260px;
  margin: 0;
  user-select: none;
`;

const SVGContainer = styled.svg`
  width: 100%;
  height: 100%;
  overflow: visible;

  &.dragging {
    cursor: grabbing;
  }
`;

const BackgroundArc = styled.path`
  fill: none;
  stroke: var(--disabled-color, #e7e7e8);
  stroke-width: 24;
  stroke-linecap: round;
  opacity: 0.3;
`;

const CurrentTempArc = styled.path<{ stroke: string }>`
  fill: none;
  stroke: ${(props) => props.stroke};
  stroke-width: 10;
  stroke-linecap: round;
  opacity: 0.4;
  transition: stroke 0.5s ease;
  filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.15));
`;

const TargetTempArc = styled.path<{ stroke: string; isActive?: boolean }>`
  fill: none;
  stroke: ${(props) => props.stroke};
  stroke-width: ${(props) => (props.isActive ? '28' : '24')};
  stroke-linecap: round;
  transition: stroke 0.5s ease, stroke-width 0.2s ease;
  pointer-events: all;
  filter: drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.25));
  opacity: 0.95;

  &:hover {
    stroke-width: 28;
    opacity: 1;
  }
`;

const CenterContent = styled.div`
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
  width: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
`;

const MainTemperature = styled.div`
  font-size: 72px;
  font-weight: 400;
  line-height: 1;
  color: var(--primary-text-color, #212121);
  letter-spacing: -3px;
`;

const TemperatureUnit = styled.span`
  font-size: 24px;
  font-weight: 300;
  margin-left: 2px;
  opacity: 0.5;
`;

const Separator = styled.div`
  width: 40px;
  height: 1px;
  background: var(--divider-color, #e0e0e0);
  margin: 4px auto;
`;

const TargetTempDisplay = styled.div`
  margin-top: 12px;
  font-size: 18px;
  color: var(--secondary-text-color, #757575);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

const StatsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  width: 100%;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
`;

const StatValue = styled.div`
  font-size: 14px;
  font-weight: 500;
  color: var(--primary-text-color, #212121);
`;

const StatLabel = styled.div`
  font-size: 10px;
  color: var(--secondary-text-color, #757575);
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ControlButton = styled.button`
  background: transparent;
  border: 2px solid var(--divider-color, #e0e0e0);
  border-radius: 50%;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--primary-text-color, #212121);
  transition: all 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    border-color: var(--primary-color, #03A9F4);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 24px;
    height: 24px;
  }
`;

const IconButtons = styled.div`
  display: flex;
  gap: 8px;
  margin-top: -48px;
  margin-bottom: 12px;
  justify-content: center;
  z-index: 10;
`;

const IconButton = styled.button<{ active?: boolean }>`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.active ? 'var(--primary-color, #03A9F4)' : 'var(--disabled-text-color, #bdbdbd)'};
  transition: color 0.3s ease, transform 0.2s ease;
  border-radius: 50%;
  width: 40px;
  height: 40px;

  &:hover {
    color: ${props => props.active ? 'var(--primary-color, #03A9F4)' : 'var(--secondary-text-color, #757575)'};
    background: rgba(0, 0, 0, 0.05);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 24px;
    height: 24px;
  }
`;

const Controls = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: -12px;
  width: 100%;
`;

const CurrentTempHandle = styled.circle<{ fill: string }>`
  fill: ${(props) => props.fill};
  stroke: white;
  stroke-width: 2.5;
  filter: drop-shadow(0px 0px 4px rgba(0, 0, 0, 0.3));
  pointer-events: none;
  opacity: 0.75;
  transition: fill 0.5s ease;
`;

const TargetTempHandle = styled.circle<{ fill: string; isActive?: boolean }>`
  fill: ${(props) => props.fill};
  stroke: white;
  stroke-width: 3.5;
  filter: drop-shadow(0px 0px 5px rgba(0, 0, 0, 0.4));
  cursor: grab;
  transition: r 0.2s ease, stroke-width 0.2s ease, fill 0.5s ease;
  r: ${(props) => (props.isActive ? '11' : '9')};
  opacity: 0.95;

  &:hover {
    r: 11;
    opacity: 1;
  }

  &:active {
    cursor: grabbing;
  }
`;


// Constants for the circular slider
const RADIUS = 110;
const MAX_ANGLE = 270;
const ROTATE_ANGLE = 225; // Gap at bottom

// Helper functions
const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number
) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const createArcPath = (
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string => {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

const xy2polar = (x: number, y: number) => {
  const r = Math.sqrt(x * x + y * y);
  let phi = Math.atan2(y, x);
  return { r, phi };
};

const rad2deg = (rad: number) => {
  return (rad * 180) / Math.PI;
};

export const ThermostatControl: React.FC<ThermostatProps> = ({ channel }) => {
  const datapoints = channel.datapoints;
  const targetTemperature = datapoints.SET_POINT_TEMPERATURE;
  const currentTemperature = datapoints.ACTUAL_TEMPERATURE;
  const humidity = datapoints.HUMIDITY;
  const windowOpen = datapoints.WINDOW_STATE === 1;

  const { setDataPoint } = useWebSocketContext();
  const [isDragging, setIsDragging] = useState(false);
  const [localTarget, setLocalTarget] = useState(targetTemperature);
  const [ecoMode, setEcoMode] = useState(false);
  const [boostMode, setBoostMode] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserInteractionRef = useRef<number>(0);

  useEffect(() => {
    // Ignore backend updates for 3 seconds after user interaction to prevent jumping
    if (Date.now() - lastUserInteractionRef.current > 3000) {
      setLocalTarget(targetTemperature);
    }
  }, [targetTemperature]);

  // Temperature range
  const minTemp = 5;
  const maxTemp = 30;
  const step = 0.5;

  // Convert temperature to angle (0-270 degrees)
  const tempToAngle = useCallback((temp: number) => {
    const clampedTemp = Math.max(minTemp, Math.min(maxTemp, temp));
    const percentage = (clampedTemp - minTemp) / (maxTemp - minTemp);
    return percentage * MAX_ANGLE;
  }, [minTemp, maxTemp]);

  // Convert angle to temperature
  const angleToTemp = useCallback((angle: number) => {
    const percentage = Math.max(0, Math.min(1, angle / MAX_ANGLE));
    const temp = minTemp + percentage * (maxTemp - minTemp);
    // Round to nearest step
    return Math.round(temp / step) * step;
  }, [minTemp, maxTemp, step]);

  const currentAngle = tempToAngle(currentTemperature);
  const targetAngle = tempToAngle(localTarget);

  const centerX = 130;
  const centerY = 130;

  // Create arc paths
  const backgroundPath = createArcPath(centerX, centerY, RADIUS, 0, MAX_ANGLE);
  const currentPath = createArcPath(centerX, centerY, RADIUS, 0, currentAngle);
  const targetPath = createArcPath(centerX, centerY, RADIUS, 0, targetAngle);

  // Calculate handle positions
  const currentHandlePos = polarToCartesian(centerX, centerY, RADIUS, currentAngle);
  const targetHandlePos = polarToCartesian(centerX, centerY, RADIUS, targetAngle);

  const handleInteractionStart = (clientX: number, clientY: number) => {
    lastUserInteractionRef.current = Date.now();
    setIsDragging(true);
    updateTemperatureFromPosition(clientX, clientY);
  };

  const handleInteractionMove = (clientX: number, clientY: number) => {
    if (isDragging) {
      updateTemperatureFromPosition(clientX, clientY);
    }
  };

  const handleInteractionEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      // Debounce the actual update
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setDataPoint(
          channel.interfaceName,
          channel.address,
          'SET_POINT_TEMPERATURE',
          localTarget
        );
      }, 500);
    }
  };

  const updateTemperatureFromPosition = (clientX: number, clientY: number) => {
    if (!svgRef.current) return;

    const svgRect = svgRef.current.getBoundingClientRect();
    const svgX = clientX - svgRect.left;
    const svgY = clientY - svgRect.top;

    // Convert to SVG coordinates (based on viewBox)
    const scaleX = 260 / svgRect.width;
    const scaleY = 260 / svgRect.height;
    
    const x = svgX * scaleX - centerX;
    const y = svgY * scaleY - centerY;

    // Calculate angle in degrees
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    
    // Normalize to 0-360
    angle = angle + 90; // Adjust so 0° is at top
    if (angle < 0) angle += 360;

    // Subtract rotation to get angle in our coordinate system
    angle = angle - ROTATE_ANGLE;
    if (angle < 0) angle += 360;

    // Handle the gap (270-360 degrees)
    if (angle > MAX_ANGLE) {
      const gapStart = MAX_ANGLE;
      const gapEnd = 360;
      const gapMid = gapStart + (gapEnd - gapStart) / 2;
      
      if (angle < gapMid) {
        angle = MAX_ANGLE; // Snap to max
      } else {
        angle = 0; // Snap to min
      }
    }

    const newTemp = angleToTemp(angle);
    setLocalTarget(newTemp);
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleInteractionStart(e.clientX, e.clientY);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    handleInteractionMove(e.clientX, e.clientY);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    handleInteractionEnd();
  }, [isDragging, localTarget]);

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInteractionStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInteractionMove(touch.clientX, touch.clientY);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    handleInteractionEnd();
  }, [isDragging, localTarget]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const decreaseTemperature = () => {
    lastUserInteractionRef.current = Date.now();
    const newTemp = Math.max(minTemp, localTarget - step);
    setLocalTarget(newTemp);
    setDataPoint(
      channel.interfaceName,
      channel.address,
      'SET_POINT_TEMPERATURE',
      newTemp
    );
  };

  const increaseTemperature = () => {
    lastUserInteractionRef.current = Date.now();
    const newTemp = Math.min(maxTemp, localTarget + step);
    setLocalTarget(newTemp);
    setDataPoint(
      channel.interfaceName,
      channel.address,
      'SET_POINT_TEMPERATURE',
      newTemp
    );
  };

  const currentColor = getColor(currentTemperature);
  const targetColor = getColor(localTarget);

  return (
    <Container>
      <Header>
        <ChannelName name={channel.name} maxWidth="220px" />
      </Header>

      <ThermostatWrapper>
        <SVGContainer
          ref={svgRef}
          viewBox="0 0 260 260"
          className={isDragging ? 'dragging' : ''}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <g transform={`rotate(${ROTATE_ANGLE} ${centerX} ${centerY})`}>
            {/* Background arc */}
            <BackgroundArc d={backgroundPath} />

            {/* Current temperature arc (thin, with handle) */}
            <CurrentTempArc key={`arc-current-${currentColor}`} d={currentPath} stroke={currentColor} />
            <CurrentTempHandle
              key={`handle-current-${currentColor}`}
              cx={currentHandlePos.x}
              cy={currentHandlePos.y}
              r={5}
              fill={currentColor}
            />

            {/* Target temperature arc (thick, interactive with handle) */}
            <TargetTempArc
              key={`arc-target-${targetColor}`}
              d={targetPath}
              stroke={targetColor}
              isActive={isDragging}
            />
            <TargetTempHandle
              key={`handle-target-${targetColor}`}
              cx={targetHandlePos.x}
              cy={targetHandlePos.y}
              fill={targetColor}
              isActive={isDragging}
            />
          </g>
        </SVGContainer>

        <CenterContent>
          {windowOpen ? (
            <MaterialSymbolsLightWindowOpen fontSize={24} color="#80a7c4" style={{ marginBottom: '2px' }} />
          ) : (
            <MaterialSymbolsLightWindowClosed fontSize={24} color="#757575" style={{ marginBottom: '2px', opacity: 0.3 }} />
          )}
          <MainTemperature>
            {localTarget.toFixed(1)}
            <TemperatureUnit>°C</TemperatureUnit>
          </MainTemperature>

          <Separator />

          <StatsRow>
            <StatItem>
              <StatValue>{currentTemperature.toFixed(1)}°C</StatValue>
              <StatLabel>Aktuell</StatLabel>
            </StatItem>
            {humidity !== undefined && humidity > 0 && (
              <StatItem>
                <StatValue>{humidity}%</StatValue>
                <StatLabel>Luftfeuchte</StatLabel>
              </StatItem>
            )}
          </StatsRow>
        </CenterContent>
      </ThermostatWrapper>

      <IconButtons>
        <IconButton
          active={boostMode}
          onClick={() => setBoostMode(!boostMode)}
          title="Boost"
        >
          <MdiFlame />
        </IconButton>
        <IconButton
          active={ecoMode}
          onClick={() => setEcoMode(!ecoMode)}
          title="Eco"
        >
          <MdiLeaf />
        </IconButton>
        <IconButton
          onClick={() => console.log('Power off')}
          title="Ausschalten"
        >
          <MdiPowerStandby />
        </IconButton>
      </IconButtons>

      <Controls>
        <ControlButton onClick={decreaseTemperature} title="Temperatur verringern">
          <MdiMinus />
        </ControlButton>

        <ControlButton onClick={increaseTemperature} title="Temperatur erhöhen">
          <MdiPlus />
        </ControlButton>
      </Controls>
    </Container>
  );
};
