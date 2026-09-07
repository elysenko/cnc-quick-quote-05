import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restricts a handler to the listed roles. Enforced by RolesGuard (403). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
