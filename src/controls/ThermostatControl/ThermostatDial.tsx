import styled from '@emotion/styled';
import { RADIUS, CENTER_X, CENTER_Y, ROTATE_ANGLE } from './constants';
import { createArcPath, polarToCartesian, getColor } from './utils';
import { useTemperatureConversion } from './hooks/useTemperatureConversion';
import { useDragInteraction } from './hooks/useDragInteraction';

interface ThermostatDialProps {
  currentTemperature: number;
  localTarget: number;
  onTemperatureChange: (temp: number) => void;
  onInteractionEnd: (temp: number) => void;
}

const ThermostatWrapper = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
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
  stroke: ${props => props.theme.colors.border};
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
  pointer-events: none;
  transition: stroke 0.5s ease;
  filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.15));
`;

const TargetTempArc = styled.path<{ stroke: string; isActive?: boolean; opacity?: number }>`
  fill: none;
  stroke: ${(props) => props.stroke};
  stroke-width: ${(props) => (props.isActive ? '28' : '24')};
  stroke-linecap: round;
  transition: stroke 0.5s ease, stroke-width 0.2s ease, opacity 0.2s ease;
  pointer-events: all;
  filter: drop-shadow(0px 0px 3px rgba(0, 0, 0, 0.25));
  opacity: ${(props) => props.opacity ?? 1};

  &:hover {
    stroke-width: 28;
  }
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

export const ThermostatDial: React.FC<ThermostatDialProps> = ({
  currentTemperature,
  localTarget,
  onTemperatureChange,
  onInteractionEnd,
}) => {
  const { tempToAngle } = useTemperatureConversion();
  const { isDragging: dragState, svgRef, handleMouseDown, handleTouchStart } = useDragInteraction({
    onTemperatureChange,
    onInteractionEnd,
    currentTemp: localTarget,
  });

  const currentAngle = tempToAngle(currentTemperature);
  const targetAngle = tempToAngle(localTarget);

  // Create arc paths
  const backgroundPath = createArcPath(CENTER_X, CENTER_Y, RADIUS, 0, 270);
  const currentPath = createArcPath(CENTER_X, CENTER_Y, RADIUS, 0, currentAngle);

  // Split target path into two segments
  const minAngle = Math.min(currentAngle, targetAngle);
  const maxAngle = Math.max(currentAngle, targetAngle);

  const targetPathSolid = createArcPath(CENTER_X, CENTER_Y, RADIUS, 0, minAngle);
  const targetPathDiff = createArcPath(CENTER_X, CENTER_Y, RADIUS, minAngle, maxAngle);

  // Calculate handle positions
  const currentHandlePos = polarToCartesian(CENTER_X, CENTER_Y, RADIUS, currentAngle);
  const targetHandlePos = polarToCartesian(CENTER_X, CENTER_Y, RADIUS, targetAngle);

  const currentColor = getColor(currentTemperature);
  const targetColor = getColor(localTarget);

  return (
    <ThermostatWrapper>
      <SVGContainer
        ref={svgRef}
        viewBox="0 0 260 260"
        className={dragState ? 'dragging' : ''}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <g transform={`rotate(${ROTATE_ANGLE} ${CENTER_X} ${CENTER_Y})`}>
          {/* Background arc */}
          <BackgroundArc d={backgroundPath} />

          {/* Current temperature arc (thin, sits behind target) */}
          <CurrentTempArc key={`arc-current-${currentColor}`} d={currentPath} stroke={currentColor} />

          {/* Target temperature arc - Solid Part (0 to Min) */}
          <TargetTempArc
            key={`arc-target-solid-${targetColor}`}
            d={targetPathSolid}
            stroke={targetColor}
            isActive={dragState}
            opacity={1}
          />

          {/* Target temperature arc - Diff Part (Min to Max) */}
          {targetAngle > currentAngle && (
            <TargetTempArc
              key={`arc-target-diff-${targetColor}`}
              d={targetPathDiff}
              stroke={targetColor}
              isActive={dragState}
              opacity={0.5}
            />
          )}

          {/* Current temperature handle (sits on top of target arc) */}
          <CurrentTempHandle
            key={`handle-current-${currentColor}`}
            cx={currentHandlePos.x}
            cy={currentHandlePos.y}
            r={5}
            fill={currentColor}
          />

          {/* Target temperature handle (topmost) */}
          <TargetTempHandle
            key={`handle-target-${targetColor}`}
            cx={targetHandlePos.x}
            cy={targetHandlePos.y}
            fill={targetColor}
            isActive={dragState}
          />
        </g>
      </SVGContainer>
    </ThermostatWrapper>
  );
};