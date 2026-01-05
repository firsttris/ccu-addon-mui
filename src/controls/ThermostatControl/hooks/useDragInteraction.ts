import { useState, useCallback, useRef, useEffect } from 'react';
import { CENTER_X, CENTER_Y, ROTATE_ANGLE, MAX_ANGLE } from '../constants';
import { useTemperatureConversion } from './useTemperatureConversion';

interface UseDragInteractionProps {
  onTemperatureChange: (temp: number) => void;
  onInteractionEnd: (temp: number) => void;
  currentTemp: number;
}

export const useDragInteraction = ({ onTemperatureChange, onInteractionEnd, currentTemp }: UseDragInteractionProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { angleToTemp } = useTemperatureConversion();

  const updateTemperatureFromPosition = useCallback((clientX: number, clientY: number) => {
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
    onTemperatureChange(newTemp);
  }, [angleToTemp, onTemperatureChange]);

  const handleInteractionStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true);
    updateTemperatureFromPosition(clientX, clientY);
  }, [updateTemperatureFromPosition]);

  const handleInteractionMove = useCallback((clientX: number, clientY: number) => {
    if (isDragging) {
      updateTemperatureFromPosition(clientX, clientY);
    }
  }, [isDragging, updateTemperatureFromPosition]);

  const handleInteractionEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      // Debounce the actual update
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        onInteractionEnd(currentTemp);
      }, 500);
    }
  }, [isDragging, onInteractionEnd, currentTemp]);

  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleInteractionStart(e.clientX, e.clientY);
  }, [handleInteractionStart]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    handleInteractionMove(e.clientX, e.clientY);
  }, [handleInteractionMove]);

  const handleMouseUp = useCallback(() => {
    handleInteractionEnd();
  }, [handleInteractionEnd]);

  // Touch events
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInteractionStart(touch.clientX, touch.clientY);
  }, [handleInteractionStart]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handleInteractionMove(touch.clientX, touch.clientY);
  }, [handleInteractionMove]);

  const handleTouchEnd = useCallback(() => {
    handleInteractionEnd();
  }, [handleInteractionEnd]);

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

  return {
    isDragging,
    svgRef,
    handleMouseDown,
    handleTouchStart,
  };
};