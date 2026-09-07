import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap, throwError, catchError, finalize, map } from 'rxjs';
import { TokenStore } from './token-store';
import { apiUrl } from './api-base';
import { AppUser } from './models';

export interface SessionPayload {
  user: AppUser;
  accessToken: string;
}

/**
 * Single-flight token refresh.
 *
 * Three requests failing with 401 at once must produce ONE call to
 * /api/auth/refresh, not three — the backend rotates the refresh token on every
 * use, so concurrent refreshes would invalidate each other and sign the user
 * out. The in-flight observable is shared until it settles.
 */
@Injectable({ providedIn: 'root' })
export class SessionRefresher {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);

  private inFlight: Observable<string> | null = null;
  private onSessionLost: (() => void) | null = null;

  /** AuthService registers what to do when the session cannot be recovered. */
  registerSessionLostHandler(handler: () => void): void {
    this.onSessionLost = handler;
  }

  refresh(): Observable<string> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.http
      .post<SessionPayload>(apiUrl('/auth/refresh'), {}, { withCredentials: true })
      .pipe(
        tap((session) => {
          this.tokens.set(session.accessToken);
          this.tokens.markSessionHint();
        }),
        map((session) => session.accessToken),
        catchError((error: unknown) => {
          this.tokens.clear();
          this.tokens.clearSessionHint();
          this.onSessionLost?.();
          return throwError(() => error);
        }),
        finalize(() => {
          this.inFlight = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.inFlight;
  }
}
