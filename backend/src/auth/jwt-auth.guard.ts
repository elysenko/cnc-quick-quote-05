import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithUser } from './auth.types';

interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
}

/**
 * Requires a valid bearer access token. Applied globally; opt out per-handler
 * with @Public(). Missing/invalid/expired token ⇒ 401, which the Angular
 * interceptor turns into a single-flight refresh.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser & {
      headers: Record<string, string | string[] | undefined>;
    }>();
    const header = request.headers?.['authorization'];
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw || !raw.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Authentication required.');
    }

    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(raw.slice(7).trim());
      request.user = { id: claims.sub, email: claims.email, role: claims.role };
      return true;
    } catch {
      throw new UnauthorizedException('Session expired. Sign in again.');
    }
  }
}
