import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppUser, Role } from './models';
import { apiUrl } from './api-base';
import { TokenStore } from './token-store';
import { SessionRefresher, SessionPayload } from './session-refresher';
import { toAppError } from './errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Owns the signed-in session.
 *
 * The access token lives in memory (TokenStore); the refresh token is an
 * HttpOnly cookie, so a reload restores the session through a silent refresh
 * rather than by reading a token out of storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokens = inject(TokenStore);
  private readonly refresher = inject(SessionRefresher);

  private readonly user = signal<AppUser | null>(null);

  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly displayName = computed(() => {
    const u = this.user();
    if (!u) return '';
    return u.name?.trim() || u.email.split('@')[0];
  });

  /**
   * Label for the preview-only sign-in shortcut. Held in TypeScript behind the
   * build-time constant so the whole affordance is dead-code-eliminated from the
   * production bundle — never in a template, never behind a runtime flag.
   */
  readonly previewShortcut: string | null = COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : null;

  /** Resolves once the initial session probe has settled, so guards can wait. */
  readonly ready = signal(false);

  constructor() {
    this.refresher.registerSessionLostHandler(() => {
      this.user.set(null);
      void this.router.navigate(['/login']);
    });
    void this.restore();
  }

  /**
   * Restores the session defensively: a failed refresh simply means "signed
   * out" and we continue to a usable screen. Never throws.
   */
  private async restore(): Promise<void> {
    if (COLOSSUS_PREVIEW) {
      // Preview sessions are treated as already signed in so every authenticated
      // route renders on a cold, direct load. `/login` stays reachable because
      // guestGuard does not redirect in preview.
      this.seedPreviewSession('ADMIN');
      this.ready.set(true);
      return;
    }
    try {
      await firstValueFrom(this.refresher.refresh());
      await this.loadMe();
    } catch {
      this.user.set(null);
      this.tokens.clear();
    } finally {
      this.ready.set(true);
    }
  }

  private seedPreviewSession(role: Role): AppUser {
    const user: AppUser = {
      id: 'preview-session',
      email: 'preview@localhost',
      name: 'Preview',
      role,
      createdAt: new Date().toISOString(),
    };
    this.user.set(user);
    return user;
  }

  /** Field-level validation shared by the login and signup forms. */
  validate(creds: Credentials): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!creds.email.trim()) errors['email'] = 'Enter your email address.';
    else if (!EMAIL_RE.test(creds.email.trim())) errors['email'] = 'Enter a valid email address.';
    if (!creds.password) errors['password'] = 'Enter your password.';
    else if (creds.password.length < 8) errors['password'] = 'Password must be at least 8 characters.';
    return errors;
  }

  async login(creds: Credentials): Promise<void> {
    if (COLOSSUS_PREVIEW) {
      // Resolved locally and synchronously: the preview host has no API server,
      // so any awaited network call would strand the reviewer on this screen.
      this.seedPreviewSession('ADMIN');
      await this.router.navigate(['/quotes']);
      return;
    }
    const res = await firstValueFrom(
      this.http.post<SessionPayload>(apiUrl('/auth/login'), creds, { withCredentials: true }),
    );
    this.applySession(res);
    await this.router.navigate(['/quotes']);
  }

  async register(input: Credentials & { name: string }): Promise<void> {
    if (COLOSSUS_PREVIEW) {
      this.seedPreviewSession('ADMIN');
      await this.router.navigate(['/quotes']);
      return;
    }
    const res = await firstValueFrom(
      this.http.post<SessionPayload>(apiUrl('/auth/register'), input, { withCredentials: true }),
    );
    this.applySession(res);
    await this.router.navigate(['/quotes']);
  }

  /** Preview-only: seeds the signed-in state with no credentials at all. */
  async previewSignIn(): Promise<void> {
    if (!COLOSSUS_PREVIEW) return;
    this.seedPreviewSession('ADMIN');
    await this.router.navigate(['/quotes']);
  }

  async loadMe(): Promise<void> {
    const res = await firstValueFrom(this.http.get<{ user: AppUser }>(apiUrl('/auth/me')));
    this.user.set(res.user);
  }

  async updateProfile(name: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.patch<{ user: AppUser }>(apiUrl('/auth/profile'), { name }),
    );
    this.user.set(res.user);
  }

  /** Throws an AppError whose message the account screen renders inline. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.patch<void>(apiUrl('/auth/password'), { currentPassword, newPassword }),
      );
    } catch (error) {
      throw toAppError(error);
    }
  }

  private applySession(session: SessionPayload): void {
    this.tokens.set(session.accessToken);
    this.user.set(session.user);
  }

  async logout(): Promise<void> {
    if (!COLOSSUS_PREVIEW) {
      // A network failure must not trap the user in a signed-in shell, so the
      // local state is cleared regardless of what the server says.
      try {
        await firstValueFrom(
          this.http.post<void>(apiUrl('/auth/logout'), {}, { withCredentials: true }),
        );
      } catch {
        /* already effectively signed out */
      }
    }
    this.user.set(null);
    this.tokens.clear();
    await this.router.navigate(['/login']);
  }
}
