import { Injectable, signal } from '@angular/core';

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
}
