import React, { Suspense } from 'react';
import { GenericControl } from '../controls/GenericControl';
import { controlOverrides } from '../controls/registry';
import type { Channel, GenericChannel } from '../types/types';
import { TileSkeleton } from './ui/skeleton';

interface ControlComponentProps {
  channel: Channel;
}

// The control for one channel: a hand-made one from the registry, or the
// generic renderer. Memoized: an event creates a new object only for the
// channel it concerns, so all other controls can skip rendering.
export const ControlComponent = React.memo(function ControlComponent({ channel }: ControlComponentProps) {
  const override = controlOverrides[channel.type];
  if (override?.per === 'channel') {
    // The tiles are loaded on first use (registry)
    return (
      <Suspense fallback={<TileSkeleton />}>
        <override.component channel={channel} />
      </Suspense>
    );
  }
  return <GenericControl channel={channel as GenericChannel} />;
});
