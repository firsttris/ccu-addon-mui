import styled from '@emotion/styled';
import { m } from '../paraglide/messages';

// The add-on runs on the CCU itself, so the WebUI is at the root of the same
// host. For development against a remote CCU, set VITE_WEBUI_URL.
export const WEBUI_URL = import.meta.env.VITE_WEBUI_URL || '/';

const Link = styled.a`
  font-size: 12px;
  color: ${(props) => props.theme.colors.textSecondary};
  white-space: nowrap;
`;

// Fallback for everything the app can't do yet (settings, links, programs).
// The WebUI has no deep links without a session, so it opens its start page.
export const WebUILink = () => {
  return (
    <Link href={WEBUI_URL} target="_blank" rel="noopener noreferrer">
      {m.OPEN_IN_WEBUI()} ↗
    </Link>
  );
};
