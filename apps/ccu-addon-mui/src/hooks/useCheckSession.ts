// useCheckSession.ts
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionId, removeSessionId } from './useApi';

export const useCheckSession = (isError: boolean, error: Error) => {
  const navigate = useNavigate();
  const sessionId = useSessionId();
  useEffect(() => {
    if((isError && (error as Error)?.message.includes('access denied')) || !sessionId) {
      removeSessionId();
      navigate('/');
    }
  }, [isError, error, sessionId]);
}

export const useRedirectToRooms = () => {
    const navigate = useNavigate()
    const navigateRooms = () => navigate('/rooms');

    const sessionId = useSessionId();
  
    useEffect(() => {
      if(sessionId) {
        navigateRooms();
      }
    }, [sessionId])
    return { navigateRooms }
}