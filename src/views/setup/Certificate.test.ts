import { describe, expect, it } from 'vitest';
import { looksLikeCertificate } from './Certificate';

describe('certificate file', () => {
  const cert = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
  it('needs certificate and private key, as cp_network.cgi checks', () => {
    expect(looksLikeCertificate(cert + '-----BEGIN PRIVATE KEY-----\nMII\n-----END PRIVATE KEY-----\n')).toBe(true);
    expect(looksLikeCertificate('-----BEGIN RSA PRIVATE KEY-----\nMII\n-----END RSA PRIVATE KEY-----\n' + cert)).toBe(true);
    expect(looksLikeCertificate(cert)).toBe(false);
    expect(looksLikeCertificate(cert + '-----BEGIN EC PRIVATE KEY-----\n')).toBe(false);
  });
});
