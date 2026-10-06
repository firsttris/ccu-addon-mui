// The tabs of a device's page. Apart from DeviceSettings, so the route's
// validateSearch (which is not split off) doesn't pull the whole device page
// into the app's first chunk.
export const DEVICE_TABS = ['channels', 'links', 'programs', 'history', 'maintenance'] as const;
export type DeviceTab = (typeof DEVICE_TABS)[number];
