import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { TokenStore } from './token-store';
import { SessionRefresher } from './session-refresher';
import { isApiRequest } from './api-base';

/** Endpoints that must never trigger a refresh — they ARE the refresh path. */
const NO_RETRY = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh', '/api/auth/logout'];

/**
 * Attaches the bearer token to API calls and, on a 401, performs a SINGLE
 * refresh shared by every concurrent failure (see SessionRefresher), then
 * replays the original request with the new token.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const tokens = inject(TokenStore);
  const refresher = inject(SessionRefresher);

  if (!isApiRequest(req.url)) return next(req);

  const authorized = withToken(req, tokens.accessToken());

  return next(authorized).pipe(
    catchError((error: unknown) => {
      const isAuthFailure = error instanceof HttpErrorResponse && error.status === 401;
      const isRetryable = !NO_RETRY.some((path) => req.url.startsWith(path));

      if (!isAuthFailure || !isRetryable) {
        return throwError(() => error);
      }

      return refresher.refresh().pipe(
        switchMap((token) => next(withToken(req, token))),
        // A failed refresh must surface the ORIGINAL 401, not the refresh's own
        // error, so callers see "session expired" rather than a confusing inner
        // failure.
        catchError(() => throwError(() => error)),
      );
    }),
  );
};

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  // `withCredentials` carries the HttpOnly refresh cookie on same-origin calls.
  const base = req.clone({ withCredentials: true });
  return token ? base.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : base;
}
