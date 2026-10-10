import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../hooks/useWebsocket';

// Installs the firmware the CCU has delivered to a device
export const useInstallFirmware = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ interfaceName, address }: { interfaceName: string; address: string }) => {
      // A BidCos update answers only once the device is flashed (minutes),
      // as the WebUI waits for updateFirmware
      await request({ type: 'installFirmware', interfaceName, address }, { queue: false, timeoutMs: 20 * 60 * 1000 });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
  });
};

// Device firmware on the CCU (/etc/config/firmware), for administrators
export const useDeviceFirmwareFiles = (enabled = true) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['deviceFirmware'],
    queryFn: async () => (await request({ type: 'getDeviceFirmware' })).files,
    enabled,
    retry: false,
  });
};

// The newest device firmware at eQ-3; the server keeps the list for an
// hour, so asking again is cheap
export const useDeviceFirmwareCatalog = (enabled = true) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['deviceFirmwareCatalog'],
    queryFn: async () => (await request({ type: 'checkDeviceFirmware' }, { timeoutMs: 30000 })).versions,
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
};

// Downloading a device firmware from eQ-3 onto the CCU, or adding an
// uploaded one, takes a while: the HMServer unpacks it, the interface
// processes read it
export const DEVICE_FIRMWARE_TIMEOUT_MS = 3 * 60 * 1000;

// After device firmware was added or deleted: the files and the devices
// (AVAILABLE_FIRMWARE) change
export const useDeviceFirmwareChanged = () => {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['deviceFirmware'] }),
      queryClient.invalidateQueries({ queryKey: ['devices'] }),
    ]);
};
