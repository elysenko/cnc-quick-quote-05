import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guards redirect AT MOST ONCE and `/login` never redirects on restored state,
 * so a guard/shell redirect loop (which renders a permanently blank page)
 * is structurally impossible.
 *
 * Every guard first awaits the silent session refresh that runs on bootstrap.
 * Without that wait a deep link on a cold load would be judged unauthenticated
 * and bounce to /login while the refresh was still in flight.
 */
async function sessionSettled(auth: AuthService): Promise<void> {
  if (auth.ready()) return;
  await new Promise<void>((resolve) => {
    const start = Date.now();
    const poll = () => {
      // The 5 s ceiling means a hung refresh degrades to "signed out" rather
      // than hanging the router on a blank screen.
      if (auth.ready() || Date.now() - start > 5000) resolve();
      else setTimeout(poll, 25);
    };
    poll();
  });
}

export const authGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await sessionSettled(auth);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const adminGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await sessionSettled(auth);
  if (auth.isAdmin()) return true;
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return router.createUrlTree(['/forbidden']);
};

export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  // In preview the session is always seeded, so bouncing signed-in visitors would
  // make the login and signup screens — themselves reviewable UI — unreachable.
  if (COLOSSUS_PREVIEW) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  await sessionSettled(auth);
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree(['/quotes']);
};
