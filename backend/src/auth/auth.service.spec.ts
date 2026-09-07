import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createFakePrisma, FakePrisma } from '../../test/prisma-mock';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { AuthService } from './auth.service';

const PASSWORD = 'correct-horse-battery';

describe('AuthService', () => {
  let prisma: FakePrisma;
  let auth: AuthService;
  let jwt: JwtService;

  beforeEach(() => {
    const fake = createFakePrisma();
    prisma = fake;
    jwt = new JwtService({ secret: 'test-signing-secret' });
    auth = new AuthService(fake, jwt, new SecretCryptoService());
    // refresh() reads the token's owner through `include: { user: true }`.
    prisma.refreshToken.hydrate = (row) => ({
      ...row,
      user: prisma.user.rows.find((u) => u['id'] === row['userId']),
    });
  });

  describe('register', () => {
    it('creates the account, hashes the password and returns a usable session', async () => {
      const { session, refreshToken } = await auth.register({
        email: 'Fabricator@Shop.Test',
        password: PASSWORD,
        name: '  Dana  ',
      });

      expect(session.user.email).toBe('fabricator@shop.test'); // normalised
      expect(session.user.name).toBe('Dana'); // trimmed
      expect(session.accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();

      const stored = prisma.user.rows[0];
      expect(stored['passwordHash']).not.toBe(PASSWORD);
      await expect(bcrypt.compare(PASSWORD, stored['passwordHash'] as string)).resolves.toBe(true);
    });

    it('signs an access token carrying the user id, email and role', async () => {
      const { session } = await auth.register({ email: 'a@shop.test', password: PASSWORD });
      const claims = await jwt.verifyAsync<{ sub: string; email: string; role: Role }>(
        session.accessToken,
      );
      expect(claims.sub).toBe(session.user.id);
      expect(claims.email).toBe('a@shop.test');
      expect(claims.role).toBe(Role.ADMIN);
    });

    it('promotes the very first account to ADMIN and leaves later ones as USER', async () => {
      const first = await auth.register({ email: 'owner@shop.test', password: PASSWORD });
      const second = await auth.register({ email: 'customer@shop.test', password: PASSWORD });
      expect(first.session.user.role).toBe(Role.ADMIN);
      expect(second.session.user.role).toBe(Role.USER);
    });

    it('rejects a duplicate email with 409, case-insensitively', async () => {
      await auth.register({ email: 'dup@shop.test', password: PASSWORD });
      await expect(
        auth.register({ email: 'DUP@shop.test', password: PASSWORD }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.rows).toHaveLength(1);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await auth.register({ email: 'user@shop.test', password: PASSWORD });
    });

    it('accepts the right password', async () => {
      const { session } = await auth.login({ email: 'user@shop.test', password: PASSWORD });
      expect(session.user.email).toBe('user@shop.test');
    });

    it('rejects the wrong password with 401', async () => {
      await expect(
        auth.login({ email: 'user@shop.test', password: 'not-the-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('gives an unknown email the same 401 and message — no user enumeration', async () => {
      const unknown = auth.login({ email: 'nobody@shop.test', password: PASSWORD });
      await expect(unknown).rejects.toThrow('Email or password is incorrect.');
    });
  });

  describe('refresh rotation', () => {
    it('issues a new token and revokes the presented one', async () => {
      const registered = await auth.register({ email: 'r@shop.test', password: PASSWORD });
      const rotated = await auth.refresh(registered.refreshToken);

      expect(rotated.refreshToken).not.toBe(registered.refreshToken);
      expect(prisma.refreshToken.rows).toHaveLength(2);
      expect(prisma.refreshToken.rows[0]['revokedAt']).toBeTruthy();
      expect(prisma.refreshToken.rows[1]['revokedAt']).toBeFalsy();
    });

    it('refuses to reuse a token that was already rotated', async () => {
      const registered = await auth.register({ email: 'r2@shop.test', password: PASSWORD });
      await auth.refresh(registered.refreshToken);
      await expect(auth.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('refuses an unknown, absent or expired token', async () => {
      await expect(auth.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(auth.refresh('never-issued')).rejects.toBeInstanceOf(UnauthorizedException);

      const registered = await auth.register({ email: 'r3@shop.test', password: PASSWORD });
      prisma.refreshToken.rows[0]['expiresAt'] = new Date(Date.now() - 1000);
      await expect(auth.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('never stores the refresh token itself, only its hash', async () => {
      const registered = await auth.register({ email: 'r4@shop.test', password: PASSWORD });
      const stored = prisma.refreshToken.rows[0]['tokenHash'] as string;
      expect(stored).not.toBe(registered.refreshToken);
      expect(stored).toHaveLength(64); // sha256 hex
    });
  });

  describe('logout', () => {
    it('revokes the presented token so it can no longer be refreshed', async () => {
      const registered = await auth.register({ email: 'out@shop.test', password: PASSWORD });
      await auth.logout(registered.refreshToken);
      await expect(auth.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('is a no-op when no token is presented', async () => {
      await expect(auth.logout(undefined)).resolves.toBeUndefined();
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password and leaves the hash alone', async () => {
      const { session } = await auth.register({ email: 'cp@shop.test', password: PASSWORD });
      const before = prisma.user.rows[0]['passwordHash'];
      await expect(
        auth.changePassword(session.user.id, 'wrong', 'a-brand-new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.rows[0]['passwordHash']).toBe(before);
    });

    it('re-hashes the password and revokes every other live session', async () => {
      const registered = await auth.register({ email: 'cp2@shop.test', password: PASSWORD });
      await auth.changePassword(registered.session.user.id, PASSWORD, 'a-brand-new-password');

      const hash = prisma.user.rows[0]['passwordHash'] as string;
      await expect(bcrypt.compare('a-brand-new-password', hash)).resolves.toBe(true);
      await expect(auth.refresh(registered.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  it('exposes only public fields on the user projection', async () => {
    const { session } = await auth.register({ email: 'pub@shop.test', password: PASSWORD });
    expect(Object.keys(session.user).sort()).toEqual(['createdAt', 'email', 'id', 'name', 'role']);
  });
});
