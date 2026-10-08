import type { SelfUpdateProgressMessage } from '../types/protocol';

// The server's progress while it installs an update of the add-on
// (selfUpdateProgress), for the update wizard
type Listener = (progress: SelfUpdateProgressMessage) => void;

const listeners = new Set<Listener>();

export const onSelfUpdateProgress = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const emitSelfUpdateProgress = (progress: SelfUpdateProgressMessage) => {
  for (const listener of listeners) listener(progress);
};
