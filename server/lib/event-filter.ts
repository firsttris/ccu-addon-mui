import type { CCUEvent } from './types';

/**
 * Event filter to reduce unnecessary broadcasts
 */
export class EventFilter {
  private subscribedChannels = new Set<string>();
  private subscribedDatapoints = new Map<string, Set<string>>();

  /**
   * Subscribe to a specific channel address
   */
  subscribeChannel = (address: string): void => {
    this.subscribedChannels.add(address);
  };

  /**
   * Subscribe to a specific datapoint on a channel
   */
  subscribeDatapoint = (address: string, datapoint: string): void => {
    if (!this.subscribedDatapoints.has(address)) {
      this.subscribedDatapoints.set(address, new Set());
    }
    this.subscribedDatapoints.get(address)?.add(datapoint);
  };

  /**
   * Subscribe to multiple channels at once
   */
  subscribeChannels = (addresses: string[]): void => {
    addresses.forEach((address) => this.subscribeChannel(address));
  };

  /**
   * Unsubscribe from a channel
   */
  unsubscribeChannel = (address: string): void => {
    this.subscribedChannels.delete(address);
    this.subscribedDatapoints.delete(address);
  };

  /**
   * Clear all subscriptions
   */
  clearSubscriptions = (): void => {
    this.subscribedChannels.clear();
    this.subscribedDatapoints.clear();
  };

  /**
   * Check if an event should be broadcasted
   * @returns true if event should be sent to clients
   */
  shouldBroadcast = (event: CCUEvent): boolean => {
    const { channel, datapoint } = event.event;

    // If no subscriptions, broadcast everything (backward compatible)
    if (this.subscribedChannels.size === 0) {
      return true;
    }

    // Check if channel is subscribed
    if (!this.subscribedChannels.has(channel)) {
      return false;
    }

    // If datapoint filtering is enabled for this channel, check datapoint
    const channelDatapoints = this.subscribedDatapoints.get(channel);
    if (channelDatapoints && channelDatapoints.size > 0) {
      return channelDatapoints.has(datapoint);
    }

    // Channel is subscribed, no datapoint filter
    return true;
  };

  /**
   * Get statistics about subscriptions
   */
  getStats = () => ({
    channels: this.subscribedChannels.size,
    datapoints: Array.from(this.subscribedDatapoints.values()).reduce(
      (sum, set) => sum + set.size,
      0,
    ),
  });
}

export const createEventFilter = (): EventFilter => new EventFilter();
