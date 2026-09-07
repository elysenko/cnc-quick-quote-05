import { Injectable, signal } from '@angular/core';

/**
 * localStorage key marking "a session existed on this browser". Not a
 * credential — the refresh token itself stays in the HttpOnly cookie — this
 * is only a hint so a first-time, never-logged-in visitor doesn't fire a
 * doomed /api/auth/refresh on every cold load (which otherwise logs a 401 to
 * the console before the login screen has even rendered).
 */
const SESSION_HINT_KEY = 'cnc_session_hint';

/**
 * Holds the access token in memory only.
 *
 * The long-lived refresh token lives in an HttpOnly cookie the browser sends
 * automatically, so nothing script-readable survives a page reload — a stolen
 * localStorage dump yields no usable credential. A silent refresh on bootstrap
 * restores the session instead.
 *
 * Split out from AuthService so the interceptor can read the token without
 * importing AuthService (which would create a circular dependency).
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly token = signal<string | null>(null);

  readonly accessToken = this.token.asReadonly();

  set(token: string | null): void {
    this.token.set(token);
  }

  clear(): void {
    this.token.set(null);
  }

  /** Records that a session was established, so a future reload attempts a silent refresh. */
  markSessionHint(): void {
    try {
      localStorage.setItem(SESSION_HINT_KEY, '1');
    } catch {
      /* storage unavailable (private mode, quota) — refresh is simply skipped on reload */
    }
  }

  /** True if this browser has ever logged in and not since logged out / lost its session. */
  hasSessionHint(): boolean {
    try {
      return localStorage.getItem(SESSION_HINT_KEY) === '1';
    } catch {
      return false;
    }
  }

  /** Clears the hint so a signed-out or expired session stops probing on every reload. */
  clearSessionHint(): void {
    try {
      localStorage.removeItem(SESSION_HINT_KEY);
    } catch {
      /* no-op */
    }
  }
}
