import { SVGProps } from 'react';
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

const BackgroundArc = (props: SVGProps<SVGPathElement>) => (
  <path className="fill-none stroke-border [stroke-width:24] [stroke-linecap:round] opacity-30" {...props} />
);

const CurrentTempArc = ({ stroke, ...props }: SVGProps<SVGPathElement> & { stroke: string }) => (
  <path
    stroke={stroke}
    style={{ stroke }}
    className="fill-none [stroke-width:10] [stroke-linecap:round] opacity-40 pointer-events-none [transition:stroke_0.5s_ease] drop-shadow-[0px_0px_2px_rgba(0,0,0,0.15)]"
    {...props}
  />
);

const TargetTempArc = ({
  stroke,
  isActive,
  opacity = 1,
  ...props
}: SVGProps<SVGPathElement> & { stroke: string; isActive?: boolean; opacity?: number }) => (
  <path
    stroke={stroke}
    opacity={opacity}
    style={{ stroke, opacity }}
    className={`fill-none [stroke-linecap:round] [transition:stroke_0.5s_ease,stroke-width_0.2s_ease,opacity_0.2s_ease] pointer-events-auto drop-shadow-[0px_0px_3px_rgba(0,0,0,0.25)] ${
      isActive ? '[stroke-width:28]' : '[stroke-width:24] hover:[stroke-width:28]'
    }`}
    {...props}
  />
);

const CurrentTempHandle = ({ fill, ...props }: SVGProps<SVGCircleElement> & { fill: string }) => (
  <circle
    fill={fill}
    style={{ fill }}
    className="stroke-white [stroke-width:2.5] drop-shadow-[0px_0px_4px_rgba(0,0,0,0.3)] pointer-events-none opacity-75 [transition:fill_0.5s_ease]"
    {...props}
  />
);

const TargetTempHandle = ({ fill, isActive, ...props }: SVGProps<SVGCircleElement> & { fill: string; isActive?: boolean }) => (
  <circle
    fill={fill}
    style={{ fill }}
    className={`stroke-white [stroke-width:3.5] drop-shadow-[0px_0px_5px_rgba(0,0,0,0.4)] cursor-grab active:cursor-grabbing [transition:r_0.2s_ease,stroke-width_0.2s_ease,fill_0.5s_ease] opacity-95 hover:opacity-100 ${
      isActive ? '[r:11]' : '[r:9] hover:[r:11]'
    }`}
    {...props}
  />
);

export const ThermostatDial: React.FC<ThermostatDialProps> = ({
  currentTemperature,
  localTarget,
  onTemperatureChange,
  onInteractionEnd,
}) => {
  const { tempToAngle } = useTemperatureConversion();
  const { isDragging: dragState, svgRef, handlePointerDown, handlePointerMove, handlePointerUp } = useDragInteraction({
    onTemperatureChange,
    onInteractionEnd,
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
    <div className="relative w-full h-full m-0 select-none">
      <svg
        ref={svgRef}
        viewBox="0 0 260 260"
        className={`w-full h-full overflow-visible touch-none ${dragState ? 'dragging cursor-grabbing' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
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
      </svg>
    </div>
  );
};