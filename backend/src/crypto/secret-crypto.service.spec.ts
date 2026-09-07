import { SecretCryptoService } from './secret-crypto.service';

describe('SecretCryptoService', () => {
  const original = process.env.APP_SECRET;

  beforeEach(() => {
    process.env.APP_SECRET = 'spec-app-secret';
  });

  afterAll(() => {
    if (original === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = original;
  });

  it('round-trips a secret', () => {
    const crypto = new SecretCryptoService();
    const payload = crypto.encryptSecret('sk_test_value');
    expect(payload).not.toContain('sk_test_value');
    expect(crypto.decryptSecret(payload)).toBe('sk_test_value');
  });

  it('produces a different ciphertext every time (random IV)', () => {
    const crypto = new SecretCryptoService();
    const a = crypto.encryptSecret('same-input');
    const b = crypto.encryptSecret('same-input');
    expect(a).not.toBe(b);
    expect(crypto.decryptSecret(a)).toBe(crypto.decryptSecret(b));
  });

  it('returns null for an absent value rather than throwing', () => {
    const crypto = new SecretCryptoService();
    expect(crypto.decryptSecret(null)).toBeNull();
    expect(crypto.decryptSecret(undefined)).toBeNull();
    expect(crypto.decryptSecret('')).toBeNull();
  });

  it('returns null for a malformed or tampered payload', () => {
    const crypto = new SecretCryptoService();
    const payload = crypto.encryptSecret('sk_test_value');
    const parts = payload.split(':');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(crypto.decryptSecret(parts.join(':'))).toBeNull();
    expect(crypto.decryptSecret('not-even-close')).toBeNull();
    expect(crypto.decryptSecret('v2:a:b:c')).toBeNull();
  });

  it('returns null — never a wrong plaintext — after APP_SECRET rotates', () => {
    const before = new SecretCryptoService();
    const payload = before.encryptSecret('sk_test_value');
    process.env.APP_SECRET = 'a-rotated-app-secret';
    const after = new SecretCryptoService();
    expect(after.decryptSecret(payload)).toBeNull();
  });

  it('hashes deterministically for refresh-token lookup', () => {
    const crypto = new SecretCryptoService();
    expect(crypto.sha256('token-a')).toBe(crypto.sha256('token-a'));
    expect(crypto.sha256('token-a')).not.toBe(crypto.sha256('token-b'));
    expect(crypto.sha256('token-a')).toMatch(/^[0-9a-f]{64}$/);
  });
});
