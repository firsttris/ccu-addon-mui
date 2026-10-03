import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import styled from '@emotion/styled';
import { useWebSocketContext } from '../hooks/useWebsocket';
import { useTranslations } from '../i18n/utils';
import { DeviceProblem } from '../types/types';
import { WebUILink } from '../components/WebUILink';

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px;
  padding-top: 76px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Title = styled.h1`
  text-align: center;
  margin: 0 0 20px;
  color: ${(props) => props.theme.colors.text};
`;

const MenuItem = styled(Link)`
  display: flex;
  align-items: center;
  padding: 16px;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 8px;
  text-decoration: none;
  color: ${(props) => props.theme.colors.text};
  background: ${(props) => props.theme.colors.surface};
  transition: background 0.2s;

  &:hover {
    background: ${(props) => props.theme.colors.hover};
  }
`;

const MenuText = styled.span`
  font-size: 20px;
  font-weight: 600;
  margin-left: 16px;
`;

const SectionTitle = styled.h2`
  margin: 12px 0 0;
  font-size: 18px;
  color: ${(props) => props.theme.colors.text};
`;

const ProblemList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid ${(props) => props.theme.colors.border};
  border-radius: 8px;
  overflow: hidden;
`;

const ProblemItem = styled.li`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  color: ${(props) => props.theme.colors.text};
  background: ${(props) => props.theme.colors.surface};
  border-bottom: 1px solid ${(props) => props.theme.colors.border};

  &:last-of-type {
    border-bottom: none;
  }

  a {
    color: inherit;
  }
`;

const ProblemName = styled.span`
  flex: 1;
  min-width: 0;
  font-weight: 600;
`;

const Badge = styled('span', {
  shouldForwardProp: (prop) => prop !== 'severity',
})<{ severity: 'warning' | 'error' }>`
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  background: ${({ severity }) =>
    severity === 'error' ? 'rgba(244, 67, 54, 0.2)' : 'rgba(255, 193, 7, 0.25)'};
`;

const AllGood = styled.p`
  margin: 0;
  color: ${(props) => props.theme.colors.textSecondary};
`;

const ProblemRow = ({ problem }: { problem: DeviceProblem }) => {
  const t = useTranslations();
  return (
    <ProblemItem>
      <ProblemName>
        {problem.name}
        <br />
        <small style={{ fontWeight: 400 }}>
          {problem.roomId ? (
            <Link to="/room/$roomId" params={{ roomId: String(problem.roomId) }}>
              {problem.roomName}
            </Link>
          ) : (
            t('NO_ROOM')
          )}
          {' · '}
          <WebUILink />
        </small>
      </ProblemName>
      {problem.unreach && <Badge severity="error">📡 {t('UNREACH')}</Badge>}
      {problem.lowBat && <Badge severity="warning">🪫 {t('LOW_BAT')}</Badge>}
    </ProblemItem>
  );
};

export const Home = () => {
  const t = useTranslations();
  const { deviceProblems, getDeviceProblems } = useWebSocketContext();

  useEffect(() => {
    getDeviceProblems();
  }, [getDeviceProblems]);

  return (
    <Container>
      <Title>CCU Addon MUI</Title>
      <MenuItem to="/rooms">
        <span role="img" aria-hidden>
          🏠
        </span>
        <MenuText>{t('ROOMS')}</MenuText>
      </MenuItem>
      <MenuItem to="/trades">
        <span role="img" aria-hidden>
          🔧
        </span>
        <MenuText>{t('TRADES')}</MenuText>
      </MenuItem>
      <MenuItem to="/devices">
        <span role="img" aria-hidden>
          📋
        </span>
        <MenuText>{t('ALL_DEVICES')}</MenuText>
      </MenuItem>

      {deviceProblems !== null && (
        <>
          <SectionTitle>{t('DEVICE_PROBLEMS')}</SectionTitle>
          {deviceProblems.length === 0 ? (
            <AllGood>✅ {t('NO_DEVICE_PROBLEMS')}</AllGood>
          ) : (
            <ProblemList aria-label={t('DEVICE_PROBLEMS')}>
              {deviceProblems.map((problem) => (
                <ProblemRow key={problem.address} problem={problem} />
              ))}
            </ProblemList>
          )}
        </>
      )}
    </Container>
  );
};
