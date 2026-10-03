import { describe, expect, it } from 'vitest';
import { passwordAllowed, textAllowed } from './Users';

describe('Users', () => {
  it('allows the WebUI password characters only', () => {
    expect(passwordAllowed('Geheim.1=!$():;#*-')).toBe(true);
    expect(passwordAllowed('')).toBe(true);
    expect(passwordAllowed('mit leer')).toBe(false);
    expect(passwordAllowed('x^y')).toBe(false);
    expect(passwordAllowed('ä')).toBe(false);
  });

  it('refuses characters the WebUI forbids in names', () => {
    expect(textAllowed('Anna Muster')).toBe(true);
    expect(textAllowed('<b>')).toBe(false);
    expect(textAllowed('a^b')).toBe(false);
    expect(textAllowed('{x}')).toBe(false);
  });
});
