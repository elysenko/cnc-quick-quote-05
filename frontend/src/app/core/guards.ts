import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guards redirect AT MOST ONCE and `/login` never redirects on restored state,
 * so a guard/shell redirect loop (which renders a permanently blank page)
 * is structurally impossible.
 */

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  return router.createUrlTree(['/forbidden']);
};

export const guestGuard: CanActivateFn = () => {
  // In preview the session is always seeded, so bouncing signed-in visitors would
  // make the login and signup screens — themselves reviewable UI — unreachable.
  if (COLOSSUS_PREVIEW) return true;
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree(['/quotes']);
};
