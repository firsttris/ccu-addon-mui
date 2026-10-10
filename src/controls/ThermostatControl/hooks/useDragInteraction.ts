import { useState, useCallback, useRef } from 'react';
import { CENTER_X, CENTER_Y, ROTATE_ANGLE, MAX_ANGLE, TemperatureRange } from '../constants';
import { useTemperatureConversion } from './useTemperatureConversion';

interface UseDragInteractionProps {
  onTemperatureChange: (temp: number) => void;
  onInteractionEnd: (temp: number) => void;
  range?: TemperatureRange;
}

export const useDragInteraction = ({ onTemperatureChange, onInteractionEnd, range }: UseDragInteractionProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // The value of the last move: pointerup can fire before React has
  // rendered that move, so the localTarget prop may still be one step behind.
  const lastTempRef = useRef<number | null>(null);
  const { angleToTemp } = useTemperatureConversion(range);

  const updateTemperatureFromPosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;

      const svgRect = svgRef.current.getBoundingClientRect();
      const svgX = clientX - svgRect.left;
      const svgY = clientY - svgRect.top;

      // Convert to SVG coordinates (based on viewBox)
      const scaleX = 260 / svgRect.width;
      const scaleY = 260 / svgRect.height;

      const x = svgX * scaleX - CENTER_X;
      const y = svgY * scaleY - CENTER_Y;

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
      lastTempRef.current = newTemp;
      onTemperatureChange(newTemp);
    },
    [angleToTemp, onTemperatureChange],
  );

  const handleInteractionStart = useCallback(
    (clientX: number, clientY: number) => {
      setIsDragging(true);
      updateTemperatureFromPosition(clientX, clientY);
    },
    [updateTemperatureFromPosition],
  );

  const handleInteractionMove = useCallback(
    (clientX: number, clientY: number) => {
      updateTemperatureFromPosition(clientX, clientY);
    },
    [updateTemperatureFromPosition],
  );

  const handleInteractionEnd = useCallback(() => {
    setIsDragging(false);
    if (lastTempRef.current !== null) {
      onInteractionEnd(lastTempRef.current);
    }
  }, [onInteractionEnd]);

  // Pointer events (works for mouse, touch, and pen)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (svgRef.current) {
        svgRef.current.setPointerCapture(e.pointerId);
      }
      handleInteractionStart(e.clientX, e.clientY);
    },
    [handleInteractionStart],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        e.preventDefault();
        handleInteractionMove(e.clientX, e.clientY);
      }
    },
    [isDragging, handleInteractionMove],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isDragging) {
        e.preventDefault();
        if (svgRef.current) {
          svgRef.current.releasePointerCapture(e.pointerId);
        }
        handleInteractionEnd();
      }
    },
    [isDragging, handleInteractionEnd],
  );

  return {
    isDragging,
    svgRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
};
