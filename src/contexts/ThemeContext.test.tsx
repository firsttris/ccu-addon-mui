import { afterEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { ThemeProvider } from './ThemeContext';

// openccu-lite shows the app in its frame and tells it its theme: in the
// address (?theme=) and by postMessage when the user switches
describe('ThemeProvider in openccu-lite', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  });

  it('takes the theme from the address', () => {
    window.history.replaceState(null, '', '/?theme=dark&lang=de');
    render(<ThemeProvider>x</ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows a change the frame posts', () => {
    window.history.replaceState(null, '', '/?theme=light');
    render(<ThemeProvider>x</ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe('light');
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, data: { type: 'openccu-lite:theme', theme: 'dark' } }));
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
    // Another site's message changes nothing
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: { type: 'openccu-lite:theme', theme: 'light' } }));
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
