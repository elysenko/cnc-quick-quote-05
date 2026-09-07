import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { PublicUser, SessionResponse } from './auth.types';

/** Matches prisma/seed/seed.js so a platform-minted password verifies here. */
const BCRYPT_ROUNDS = 10;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: SecretCryptoService,
  ) {}

  static toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * First account created on an empty user table becomes ADMIN, so a fresh
   * self-hosted install has an administrator. In a Colossus deployment the
   * platform seed has already created one, so signups land as USER.
   */
  async register(input: { email: string; password: string; name?: string }): Promise<{
    session: SessionResponse;
    refreshToken: string;
  }> {
    const email = this.normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with that email address already exists.');
    }

    const userCount = await this.prisma.user.count();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        passwordHash,
        role: userCount === 0 ? Role.ADMIN : Role.USER,
      },
    });

    return this.issueSession(user);
  }

  async login(input: { email: string; password: string }): Promise<{
    session: SessionResponse;
    refreshToken: string;
  }> {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Same message and roughly the same work either way — no user enumeration.
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    return this.issueSession(user);
  }

  /** Rotates: the presented token is revoked and a fresh one issued. */
  async refresh(presentedToken: string | undefined): Promise<{
    session: SessionResponse;
    refreshToken: string;
  }> {
    if (!presentedToken) throw new UnauthorizedException('Session expired. Sign in again.');

    const tokenHash = this.crypto.sha256(presentedToken);
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired. Sign in again.');
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(row.user);
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    const tokenHash = this.crypto.sha256(presentedToken);
    await this.prisma.refreshToken
      .updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch((error: Error) => this.logger.warn(`Logout revoke failed: ${error.message}`));
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateProfile(userId: string, name: string | null): Promise<PublicUser> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { name } });
    return AuthService.toPublicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    // Every other session for this user is invalidated by the password change.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: User): Promise<{ session: SessionResponse; refreshToken: string }> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: ACCESS_TTL_SECONDS },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: this.crypto.sha256(refreshToken), expiresAt },
    });

    return {
      session: { user: AuthService.toPublicUser(user), accessToken },
      refreshToken,
    };
  }

  static get refreshCookieMaxAgeMs(): number {
    return REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
  }
}
