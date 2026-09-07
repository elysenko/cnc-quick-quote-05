import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

interface FakeRequest {
  headers: Record<string, string | undefined>;
  user?: { id: string; email: string; role: Role };
}

function contextFor(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: 'guard-test-secret' });
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    guard = new JwtAuthGuard(jwt, reflector);
  });

  it('rejects a request with no Authorization header', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a non-bearer scheme', async () => {
    const context = contextFor({ headers: { authorization: 'Basic abc123' } });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with the wrong key', async () => {
    const foreign = new JwtService({ secret: 'a-different-secret' });
    const token = await foreign.signAsync({ sub: 'u1', email: 'a@b.c', role: Role.USER });
    const context = contextFor({ headers: { authorization: `Bearer ${token}` } });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const token = await jwt.signAsync(
      { sub: 'u1', email: 'a@b.c', role: Role.USER },
      { expiresIn: -10 },
    );
    const context = contextFor({ headers: { authorization: `Bearer ${token}` } });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid token and attaches the caller to the request', async () => {
    const token = await jwt.signAsync({ sub: 'u1', email: 'a@b.c', role: Role.ADMIN });
    const request: FakeRequest = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', email: 'a@b.c', role: Role.ADMIN });
  });

  it('lets a @Public() handler through with no token at all', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
  });
});

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const admin = { id: 'u1', email: 'admin@shop.test', role: Role.ADMIN };
  const customer = { id: 'u2', email: 'customer@shop.test', role: Role.USER };

  it('allows any authenticated caller when no role is required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({ headers: {}, user: customer }))).toBe(true);
  });

  it('allows an admin onto an admin-only route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(contextFor({ headers: {}, user: admin }))).toBe(true);
  });

  it('returns 403 — not 401 — for an authenticated customer', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(contextFor({ headers: {}, user: customer }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a request that somehow carries no user', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(contextFor({ headers: {} }))).toThrow(ForbiddenException);
  });
});
