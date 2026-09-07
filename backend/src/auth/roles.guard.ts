import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { RequestWithUser } from './auth.types';

/**
 * Runs after JwtAuthGuard, so the caller is already authenticated: an
 * authenticated non-admin gets 403 (never 401), which is what the admin
 * route guard on the Angular side distinguishes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const role = request.user?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Administrator access is required for this action.');
    }
    return true;
  }
}
