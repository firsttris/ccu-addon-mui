import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCapabilities, useWebSocketActions } from '../hooks/useWebsocket';
import type { ProgramDefinition } from '../types/protocol';
import type { Program, Sysvar } from '../types/types';

// ReGa sends no events for system variables. After getSysvars the server
// reads them for all apps and sends a 'sysvars' message when they change
// (useWebsocket puts it into this query). Not asked for on a platform
// without them (openccu-lite): the lists stay empty.
export const useSysvars = () => {
  const { request, recent } = useWebSocketActions();
  const { sysvars: enabled } = useCapabilities();
  return useQuery({
    queryKey: ['sysvars'],
    enabled,
    queryFn: async () => {
      const startedAt = recent.time();
      const sysvars = (await request({ type: 'getSysvars' })).sysvars ?? [];
      // A push that came in meanwhile is newer than the answer
      return (recent.listSince('sysvars', startedAt) ?? sysvars) as Sysvar[];
    },
  });
};

export const usePrograms = () => {
  const { request } = useWebSocketActions();
  const { programs: enabled } = useCapabilities();
  return useQuery({
    queryKey: ['programs'],
    enabled,
    queryFn: async () => (await request({ type: 'getPrograms' })).programs ?? [],
  });
};

export type LogicAction =
  | { type: 'setSysvar'; id: number; value: string | number | boolean }
  | { type: 'runProgram'; id: number }
  | { type: 'setLogicOption'; id: number; option: 'visible' | 'operate'; value: boolean }
  | { type: 'setProgramActive'; id: number; active: boolean };

// Sets a system variable (shown at once), runs a program or switches it
// on or off
export const useLogicAction = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: LogicAction) => {
      await request(action, { queue: false });
    },
    onMutate: (action) => {
      if (action.type === 'setSysvar') {
        queryClient.setQueryData<Sysvar[]>(['sysvars'], (sysvars) =>
          sysvars?.map((sv) => (sv.id === action.id ? { ...sv, value: action.value } : sv)),
        );
      }
      if (action.type === 'setLogicOption') {
        const set = <T extends { id: number }>(list?: T[]) =>
          list?.map((item) => (item.id === action.id ? { ...item, [action.option]: action.value } : item));
        queryClient.setQueryData<Program[]>(['programs'], set);
        if (action.option === 'visible') queryClient.setQueryData<Sysvar[]>(['sysvars'], set);
      }
      if (action.type === 'setProgramActive') {
        queryClient.setQueryData<Program[]>(['programs'], (programs) =>
          programs?.map((p) => (p.id === action.id ? { ...p, active: action.active } : p)),
        );
      }
    },
    onSettled: async (_, __, action) => {
      if (action.type === 'setSysvar' || action.type === 'setLogicOption')
        await queryClient.invalidateQueries({ queryKey: ['sysvars'] });
      if (action.type !== 'setSysvar') await queryClient.invalidateQueries({ queryKey: ['programs'] });
    },
  });
};

// A program with its rules, for the program editor
export const useProgram = (id: number, { enabled = true }: { enabled?: boolean } = {}) => {
  const { request } = useWebSocketActions();
  return useQuery({
    queryKey: ['program', id],
    queryFn: async () => (await request({ type: 'getProgram', id })).program,
    enabled,
    staleTime: 0,
  });
};

// Saves a program (new if its id is 0) or deletes one
export const useProgramChange = () => {
  const { request } = useWebSocketActions();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      change: { type: 'saveProgram'; program: ProgramDefinition } | { type: 'deleteProgram'; id: number },
    ) => request(change, { queue: false }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['programs'] }),
        queryClient.invalidateQueries({ queryKey: ['program'] }),
      ]),
  });
};
