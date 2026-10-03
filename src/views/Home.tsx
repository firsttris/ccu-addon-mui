import { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useDeviceProblems } from '../queries';
import { DeviceProblem } from '../types/types';
import { WebUILink } from '../components/WebUILink';
import { m } from '../paraglide/messages';

const MenuItem = ({ to, children }: { to: '/rooms' | '/trades' | '/devices' | '/sysvars' | '/programs'; children: ReactNode }) => (
  <Link
    to={to}
    className="flex items-center p-4 border border-border rounded-lg no-underline text-text bg-surface transition-[background] duration-200 ease-[ease] hover:bg-hover"
  >
    {children}
  </Link>
);

const MenuText = ({ children }: { children: ReactNode }) => (
  <span className="text-[20px] font-semibold ml-4">{children}</span>
);

const Badge = ({ severity, children }: { severity: 'warning' | 'error'; children: ReactNode }) => (
  <span
    className={`shrink-0 px-2 py-[2px] rounded-[10px] text-[12px] font-semibold ${
      severity === 'error' ? 'bg-[rgba(244,67,54,0.2)]' : 'bg-[rgba(255,193,7,0.25)]'
    }`}
  >
    {children}
  </span>
);

const ProblemRow = ({ problem }: { problem: DeviceProblem }) => {
  return (
    <li className="flex items-center gap-3 py-[10px] px-4 text-text bg-surface border-b border-border last-of-type:border-b-0 [&_a]:text-inherit">
      <span className="flex-1 min-w-0 font-semibold">
        {problem.name}
        <br />
        <small style={{ fontWeight: 400 }}>
          {problem.roomId ? (
            <Link to="/room/$roomId" params={{ roomId: String(problem.roomId) }}>
              {problem.roomName}
            </Link>
          ) : (
            m.NO_ROOM()
          )}
          {' · '}
          <WebUILink />
        </small>
      </span>
      {problem.unreach && <Badge severity="error">📡 {m.UNREACH()}</Badge>}
      {problem.lowBat && <Badge severity="warning">🪫 {m.LOW_BAT()}</Badge>}
    </li>
  );
};

export const Home = () => {
  const { data: deviceProblems } = useDeviceProblems();

  return (
    <div className="max-w-[1280px] mx-auto p-4 pt-[76px] flex flex-col gap-5">
      <h1 className="text-center mt-0 mx-0 mb-5 text-text">CCU Addon MUI</h1>
      <MenuItem to="/rooms">
        <span role="img" aria-hidden>
          🏠
        </span>
        <MenuText>{m.ROOMS()}</MenuText>
      </MenuItem>
      <MenuItem to="/trades">
        <span role="img" aria-hidden>
          🔧
        </span>
        <MenuText>{m.TRADES()}</MenuText>
      </MenuItem>
      <MenuItem to="/devices">
        <span role="img" aria-hidden>
          📋
        </span>
        <MenuText>{m.ALL_DEVICES()}</MenuText>
      </MenuItem>
      <MenuItem to="/sysvars">
        <span role="img" aria-hidden>
          🔢
        </span>
        <MenuText>{m.SYSVARS()}</MenuText>
      </MenuItem>
      <MenuItem to="/programs">
        <span role="img" aria-hidden>
          ▶️
        </span>
        <MenuText>{m.PROGRAMS()}</MenuText>
      </MenuItem>

      {deviceProblems !== undefined && (
        <>
          <h2 className="mt-3 mx-0 mb-0 text-[18px] text-text">{m.DEVICE_PROBLEMS()}</h2>
          {deviceProblems.length === 0 ? (
            <p className="m-0 text-text-secondary">✅ {m.NO_DEVICE_PROBLEMS()}</p>
          ) : (
            <ul
              aria-label={m.DEVICE_PROBLEMS()}
              className="list-none m-0 p-0 border border-border rounded-lg overflow-hidden"
            >
              {deviceProblems.map((problem) => (
                <ProblemRow key={problem.address} problem={problem} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
