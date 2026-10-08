import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import CpuIcon from '~icons/lucide/cpu';
import { useWebSocketActions } from '../hooks/useWebsocket';
import { cn } from '../lib/utils';
import type { DeviceImage as Image } from '../types/protocol';

// The WebUI's line drawings of the devices (DEVDB.tcl, served by the
// server at /ws/mui/img/), tinted to the theme: multiplied onto the muted
// background in the light theme, inverted and screened in the dark one

export const DEVICE_IMAGE_PATH = '/ws/mui/img/';

export const useDeviceImages = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['deviceImages'],
    queryFn: async () => (await request({ type: 'getDeviceImages' })).images ?? {},
    // DEVDB.tcl only changes with the CCU firmware
    staleTime: Infinity,
    retry: false,
  });
};

export const useDeviceImage = (type?: string): Image | undefined => {
  const { data } = useDeviceImages();
  return type ? data?.[type.toLowerCase()] : undefined;
};

interface DeviceImageProps {
  type?: string;
  // Edge length in pixels
  size: number;
  // The channel to mark (its index, or a form name like "1+2")
  channel?: string;
  className?: string;
  // Shown while the picture is missing (default: a chip; null: nothing)
  fallback?: ReactNode;
}

export const DeviceImage = ({ type, size, channel, className, fallback }: DeviceImageProps) => {
  const image = useDeviceImage(type);
  const [failed, setFailed] = useState<string | null>(null);
  const shapes = channel ? image?.channels?.[channel] : undefined;
  const pad = Math.round(size * 0.08);
  const inner = size - 2 * pad;
  const show = image && failed !== image.path;
  return (
    <span
      aria-hidden
      data-device-image={show ? image.path : 'none'}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted',
        className,
      )}
      style={{ width: size, height: size, borderRadius: size < 60 ? 10 : 14 }}
    >
      {show ? (
        <>
          <img
            src={DEVICE_IMAGE_PATH + image.path}
            alt=""
            width={inner}
            height={inner}
            loading="lazy"
            draggable={false}
            onError={() => setFailed(image.path)}
            className="object-contain opacity-85 mix-blend-multiply dark:opacity-80 dark:mix-blend-screen dark:invert"
          />
          {shapes && (
            <svg
              className="pointer-events-none absolute text-sky-500 dark:text-sky-400"
              style={{ left: pad, top: pad, width: inner, height: inner }}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              {shapes.map((s, i) =>
                s.kind === 'rect' ? (
                  <rect
                    key={i}
                    x={s.x}
                    y={s.y}
                    width={s.w}
                    height={s.h}
                    rx={Math.min(s.w, s.h) * 0.15}
                    fill="currentColor"
                    fillOpacity={0.22}
                    stroke="currentColor"
                    strokeWidth={0.012}
                  />
                ) : (
                  <ellipse
                    key={i}
                    cx={s.x + s.w / 2}
                    cy={s.y + s.h / 2}
                    rx={s.w / 2 + 0.01}
                    ry={s.h / 2 + 0.01}
                    fill="currentColor"
                    fillOpacity={0.22}
                    stroke="currentColor"
                    strokeWidth={0.012}
                  />
                ),
              )}
            </svg>
          )}
        </>
      ) : (
        (fallback === undefined ? (
          <CpuIcon className="text-muted-foreground" style={{ width: size * 0.45, height: size * 0.45 }} />
        ) : (
          fallback
        ))
      )}
    </span>
  );
};
