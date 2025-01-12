import {
  createBrowserRouter,
  RouterProvider,
  useNavigate,
} from 'react-router-dom';
import { Login } from './app/Login';
import { Room } from './app/Room';
import { Rooms } from './app/Rooms';
import { ReactNode, useEffect } from 'react';
import { getSessionId } from './hooks/useApi';
import { WebSocketDemo } from './app/Websocket';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const sessionId = getSessionId();

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return children;
};

export const Router = () => {
  const basename = process.env.NODE_ENV === 'production' ? '/addons/mui/' : '/';
  const router = createBrowserRouter(
    [
      {
        path: '/',
        element: <Login />,
      },
      {
        path: '/room/:roomId',
        element: (
          <ProtectedRoute>
            <Room />
          </ProtectedRoute>
        ),
      },
      {
        path: '/rooms',
        element: (
          <ProtectedRoute>
            <Rooms />
          </ProtectedRoute>
        ),
      },
      {
        path: 'websocket',
        element: <WebSocketDemo />
      }
    ],
    { basename }
  );

  return <RouterProvider router={router} />;
};
