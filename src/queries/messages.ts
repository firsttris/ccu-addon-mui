import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCapabilities, useWebSocketActions } from '../hooks/useWebsocket';
import type { AlarmMessage, ServiceMessage } from '../types/protocol';

// The CCU's service messages (unreachable, battery, sticky messages, error
// codes, settings waiting for the device, ...). Loaded once; the server then
// sends them when they change ('serviceMessages'): it reads them again after
// device events of their datapoints, once for all apps.
export const useServiceMessages = () => {
  const { request, recent } = useWebSocketActions();
  return useQuery({
    queryKey: ['serviceMessages'],
    queryFn: async () => {
      const startedAt = recent.time();
      const messages = (await request({ type: 'getServiceMessages' })).messages ?? [];
      return (recent.listSince('serviceMessages', startedAt) ?? messages) as ServiceMessage[];
    },
    staleTime: Infinity,
  });
};

// Triggered alarm variables not yet acknowledged. ReGa sends no events for
// system variables: the server reads them every 15 s for all apps and sends
// them when they change ('alarmMessages').
export const useAlarmMessages = () => {
  const { request, recent } = useWebSocketActions();
  // openccu-lite has no alarm variables
  const { alarms: enabled } = useCapabilities();
  return useQuery({
    enabled,
    queryKey: ['alarmMessages'],
    queryFn: async () => {
      const startedAt = recent.time();
      const alarms = (await request({ type: 'getAlarmMessages' })).alarms ?? [];
      return (recent.listSince('alarmMessages', startedAt) ?? alarms) as AlarmMessage[];
    },
    staleTime: Infinity,
  });
};

// Acknowledges an alarm; it disappears at once
export const useAcknowledgeAlarmMessage = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => request({ type: 'acknowledgeAlarmMessage', id }, { queue: false }),
    onMutate: (id) =>
      queryClient.setQueryData<AlarmMessage[]>(['alarmMessages'], (alarms) => alarms?.filter((a) => a.id !== id)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['alarmMessages'] });
      queryClient.invalidateQueries({ queryKey: ['sysvars'] });
    },
  });
};

// Acknowledges a service message; it disappears at once
export const useAcknowledgeServiceMessage = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => request({ type: 'acknowledgeServiceMessage', id }, { queue: false }),
    onMutate: (id) =>
      queryClient.setQueryData<ServiceMessage[]>(['serviceMessages'], (messages) =>
        messages?.filter((m) => m.id !== id),
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceMessages'] });
      queryClient.invalidateQueries({ queryKey: ['deviceProblems'] });
    },
  });
};
