import { Channel, HmEvent } from '../types/types';
import { applyEvent } from './channels';

// What the server pushed lately: events, and whole lists (system variables,
// alarms, service messages). A list
// requested before a push may be answered with older values (the server
// read them first); replaying what came in meanwhile keeps the newer ones,
// instead of showing a stale value until the next event.

// Events are also replayed from shortly before the request: ReGa learns a
// value from the interface on its own, a moment after the add-on may have.
export const EVENT_GRACE_MS = 2000;
// Longer than any request waits for its answer (REQUEST_TIMEOUT_MS)
const KEEP_MS = 60000;

export class RecentUpdates {
  private events: { at: number; event: HmEvent }[] = [];
  private lists = new Map<string, { at: number; list: unknown[] }>();

  constructor(private now: () => number = Date.now) {}

  time() {
    return this.now();
  }

  addEvent(event: HmEvent) {
    const at = this.now();
    const first = this.events.findIndex((entry) => entry.at >= at - KEEP_MS);
    if (first !== 0) this.events = first < 0 ? [] : this.events.slice(first);
    this.events.push({ at, event });
  }

  // A list the server sent unasked, by its query key ('sysvars' ...)
  setList(key: string, list: unknown[]) {
    this.lists.set(key, { at: this.now(), list });
  }

  // The channels as answered for a request started at startedAt, with the
  // events since applied (in the order they came)
  channelsSince<C extends Channel>(channels: C[], startedAt: number): C[] {
    return this.events
      .filter((entry) => entry.at >= startedAt - EVENT_GRACE_MS)
      .reduce((list, entry) => applyEvent(list, entry.event) as C[], channels);
  }

  // The list pushed after startedAt, if any: it is newer than the answer to
  // a request started then. (Both come from ReGa itself, so no grace time.)
  listSince(key: string, startedAt: number): unknown[] | undefined {
    const pushed = this.lists.get(key);
    return pushed && pushed.at >= startedAt ? pushed.list : undefined;
  }
}
