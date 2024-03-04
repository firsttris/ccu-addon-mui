import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSessionId, removeSessionId } from './useApi';

export const useCheckSession = (isError: boolean, error: Error) => {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  useEffect(() => {
    if((isError && (error as Error)?.message.includes('access denied')) || !sessionId) {
      removeSessionId();
      navigate('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error, sessionId]);
}

export const useRedirectToRooms = () => {
    const navigate = useNavigate()
    const navigateRooms = () => navigate('/rooms');

    const sessionId = getSessionId();
  
    useEffect(() => {
      if(sessionId) {
        navigateRooms();
      }
      //eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId])
    return { navigateRooms }
}