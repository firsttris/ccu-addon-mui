import type { CCUEvent } from './types';

/**
 * Device-based event subscription manager
 * Each device subscribes to specific channels and only receives events for those channels
 */
export class DeviceSubscriptionManager {
  // Map: deviceId -> Set of channel addresses
  private subscriptions = new Map<string, Set<string>>();

  /**
   * Subscribe a device to a list of channels
   */
  subscribe = (deviceId: string, channels: string[]): void => {
    this.subscriptions.set(deviceId, new Set(channels));
  };

  /**
   * Unsubscribe a device from all channels
   */
  unsubscribe = (deviceId: string): void => {
    this.subscriptions.delete(deviceId);
  };

  /**
   * Check if a device should receive this event
   */
  shouldReceiveEvent = (deviceId: string, event: CCUEvent): boolean => {
    const subscribedChannels = this.subscriptions.get(deviceId);

    // No subscription = NO events (must subscribe first)
    if (!subscribedChannels) {
      return false;
    }

    // Check if event's channel is in subscribed list
    return subscribedChannels.has(event.event.channel);
  };

  /**
   * Get all subscribed channels for a device
   */
  getSubscriptions = (deviceId: string): string[] => {
    const channels = this.subscriptions.get(deviceId);
    return channels ? Array.from(channels) : [];
  };

  /**
   * Get statistics
   */
  getStats = () => ({
    devices: this.subscriptions.size,
    totalChannels: Array.from(this.subscriptions.values()).reduce(
      (sum, channels) => sum + channels.size,
      0,
    ),
  });
}

export const createDeviceSubscriptionManager = (): DeviceSubscriptionManager =>
  new DeviceSubscriptionManager();
