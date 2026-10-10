import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocketActions } from '../hooks/useWebsocket';
import type { DatapointValue } from '../types/types';

// Direct links of a device or channel
export const useLinks = (interfaceName: string, address: string) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['links', interfaceName, address],
    queryFn: async () => (await request({ type: 'getLinks', interfaceName, address })).links ?? [],
    retry: false,
  });
};

// The direct links of all interfaces (setup overview); under 'links', so
// adding or removing one reloads it
export const useAllLinks = () => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['links', 'all'],
    queryFn: async () => (await request({ type: 'getAllLinks' })).links ?? [],
    retry: false,
  });
};

// Parameters of a link on the receiver's side
export const useLinkParamset = (interfaceName: string, receiver: string, sender: string, enabled = true) => {
  const { request } = useWebSocketActions();
  const description = useQuery({
    queryKey: ['linkParamsetDescription', interfaceName, receiver, sender],
    queryFn: async () =>
      (await request({ type: 'getLinkParamsetDescription', interfaceName, address: receiver, partner: sender }))
        .description ?? {},
    staleTime: Infinity,
    retry: false,
    enabled,
  });
  const values = useQuery({
    queryKey: ['linkParamset', interfaceName, receiver, sender],
    queryFn: async () =>
      ((await request({ type: 'getLinkParamset', interfaceName, address: receiver, partner: sender })).values ??
        {}) as Record<string, DatapointValue>,
    retry: false,
    enabled,
  });
  return { description, values };
};

export type LinkAction =
  | { type: 'addLink'; interfaceName: string; sender: string; receiver: string; name: string }
  | { type: 'removeLink'; interfaceName: string; sender: string; receiver: string }
  | {
      type: 'putLinkParamset';
      interfaceName: string;
      address: string;
      partner: string;
      values: Record<string, DatapointValue>;
    };

export const useLinkAction = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: LinkAction) => {
      await request(action, { queue: false });
    },
    onSettled: () =>
      Promise.all(['links', 'linkParamset'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
};
