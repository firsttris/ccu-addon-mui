import { useId } from 'react';
import { RADIUS, CENTER_X, CENTER_Y, ROTATE_ANGLE, DEFAULT_RANGE, type TemperatureRange } from './constants';
import { createArcPath, polarToCartesian } from './utils';
import { useTemperatureConversion } from './hooks/useTemperatureConversion';
import { useDragInteraction } from './hooks/useDragInteraction';
import { useEffects } from '../../contexts/EffectsContext';
import { m } from '../../paraglide/messages';

interface ThermostatDialProps {
  label: string;
  currentTemperature: number;
  localTarget: number;
  // Color of the target (by temperature, orange while boosting)
  color: string;
  currentColor: string;
  // Heating demand or boost: the glow breathes
  demand: boolean;
  onTemperatureChange: (temp: number) => void;
  onInteractionEnd: (temp: number) => void;
  // The device's range (TEMPERATURE_MINIMUM/MAXIMUM)
  range?: TemperatureRange;
}

// The arc: target temperature (thick, draggable), actual temperature (thin
// arc with a dot), and the way still to go between them (translucent).
export const ThermostatDial: React.FC<ThermostatDialProps> = ({
  label,
  currentTemperature,
  localTarget,
  color,
  currentColor,
  demand,
  onTemperatureChange,
  onInteractionEnd,
  range = DEFAULT_RANGE,
}) => {
  const glowId = useId();
  const effects = useEffects();
  const { tempToAngle } = useTemperatureConversion(range);
  const { isDragging, svgRef, handlePointerDown, handlePointerMove, handlePointerUp } = useDragInteraction({
    onTemperatureChange,
    onInteractionEnd,
    range,
  });

  const currentAngle = tempToAngle(currentTemperature);
  const targetAngle = tempToAngle(localTarget);
  const minAngle = Math.min(currentAngle, targetAngle);

  const backgroundPath = createArcPath(CENTER_X, CENTER_Y, RADIUS, 0, 270);
  const currentPath = createArcPath(CENTER_X, CENTER_Y, RADIUS, 0, Math.max(currentAngle, 0.01));
  const targetPathSolid = createArcPath(CENTER_X, CENTER_Y, RADIUS, 0, Math.max(minAngle, 0.01));
  const targetPathDiff = createArcPath(CENTER_X, CENTER_Y, RADIUS, currentAngle, targetAngle);
  const currentHandle = polarToCartesian(CENTER_X, CENTER_Y, RADIUS, currentAngle);
  const targetHandle = polarToCartesian(CENTER_X, CENTER_Y, RADIUS, targetAngle);
  const width = isDragging ? 22 : 18;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 260 260"
      role="slider"
      aria-label={`${m.TARGET_TEMPERATURE()} ${label}`}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={localTarget}
      className={`absolute inset-0 size-full touch-none overflow-visible select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={7 * Math.max(effects.k, 0.2)} />
        </filter>
      </defs>
      <g transform={`rotate(${ROTATE_ANGLE} ${CENTER_X} ${CENTER_Y})`}>
        <path d={backgroundPath} className="fill-none stroke-muted [stroke-linecap:round]" strokeWidth={18} />
        {effects.on && (
          <g className={demand ? 'fx-breathe' : undefined}>
            <path
              d={targetPathSolid}
              className="fill-none [stroke-linecap:round]"
              stroke={color}
              strokeWidth={18}
              filter={`url(#${glowId})`}
              opacity={Math.min(1, 0.55 * effects.k)}
            />
          </g>
        )}
        <path
          d={currentPath}
          className="fill-none [stroke-linecap:round]"
          stroke={currentColor}
          strokeWidth={5}
          opacity={0.5}
        />
        <path
          d={targetPathSolid}
          className="fill-none [stroke-linecap:round] transition-[stroke,stroke-width] duration-300"
          stroke={color}
          strokeWidth={width}
        />
        {targetAngle > currentAngle && (
          <path
            d={targetPathDiff}
            className="fill-none [stroke-linecap:round] transition-[stroke,stroke-width] duration-300"
            stroke={color}
            strokeWidth={width}
            opacity={0.4}
          />
        )}
        <circle
          cx={currentHandle.x}
          cy={currentHandle.y}
          r={5.5}
          fill={currentColor}
          className="stroke-background [stroke-width:2.5] pointer-events-none"
        />
        {effects.on && (
          <circle
            cx={targetHandle.x}
            cy={targetHandle.y}
            r={isDragging ? 26 : 18}
            fill={color}
            opacity={Math.min(1, (isDragging ? 0.35 : 0.14) * effects.k)}
            className="pointer-events-none transition-[r,opacity] duration-200"
          />
        )}
        <circle
          cx={targetHandle.x}
          cy={targetHandle.y}
          r={isDragging ? 14 : 11}
          fill={color}
          className="stroke-white [stroke-width:3.5] transition-[r] duration-200"
        />
      </g>
    </svg>
  );
};
