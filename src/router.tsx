import {
  createBrowserRouter,
  RouterProvider,
} from 'react-router-dom';
import { Login } from './app/Login';
import { Room } from './app/Room';
import { Rooms } from './app/Rooms';

export const Router = () => {
  const basename = process.env.NODE_ENV === 'production' ? '/addons/mui/' : '/';
  const router = createBrowserRouter(
    [
      {
        path: '/',
        element: <Login />,
      },
      {
        path: '/rooms',
        element: (
          <Rooms />
        ),
      },
      {
        path: '/room/:roomId',
        element: (
          <Room />
        ),
      }
    ],
    { basename }
  );

  return <RouterProvider router={router} />;
};
