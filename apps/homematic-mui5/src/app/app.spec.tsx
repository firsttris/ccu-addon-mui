import { render } from '@testing-library/react';

import App from './Login';

describe('App', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<App />);

    expect(baseElement).toBeTruthy();
  });

  it('should have a greeting as the title', () => {
    const { getByText } = render(<App />);

    expect(getByText(/Welcome homematic-mui5/gi)).toBeTruthy();
  });
});
