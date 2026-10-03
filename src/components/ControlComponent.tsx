import React from 'react';
import { GenericControl } from '../controls/GenericControl';
import { controlOverrides } from '../controls/registry';
import { Channel, GenericChannel } from '../types/types';

interface ControlComponentProps {
  channel: Channel;
}

// The control for one channel: a hand-made one from the registry, or the
// generic renderer. Memoized: an event creates a new object only for the
// channel it concerns, so all other controls can skip rendering.
export const ControlComponent = React.memo(function ControlComponent({
  channel,
}: ControlComponentProps) {
  const override = controlOverrides[channel.type];
  if (override?.per === 'channel') {
    return <override.component channel={channel} />;
  }
  return <GenericControl channel={channel as GenericChannel} />;
});
