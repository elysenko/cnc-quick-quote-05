import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RequestWithUser } from '../auth/auth.types';

/**
 * Rate-limits by authenticated user id rather than IP whenever a request
 * carries one. JwtAuthGuard runs first (registered before this guard as a
 * global APP_GUARD) and attaches `request.user`, so by the time this guard's
 * `getTracker` runs, an authenticated request already has it. Falling back to
 * IP for anonymous requests keeps public endpoints (login, signup, webhook)
 * throttled per-caller instead of collapsing every visitor onto one bucket.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: RequestWithUser & Record<string, any>): Promise<string> {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${req.ip ?? req.ips?.[0] ?? 'unknown'}`;
  }
}
