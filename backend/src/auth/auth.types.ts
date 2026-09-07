import { Role } from '@prisma/client';

/** Shape the Angular AuthService expects back from /api/auth/*. */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
}

export interface SessionResponse {
  user: PublicUser;
  accessToken: string;
}

/** Populated by JwtAuthGuard and read through @CurrentUser(). */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface RequestWithUser {
  user?: AuthenticatedUser;
  cookies?: Record<string, string>;
  ip?: string;
}
