import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppUser, Role } from './models';
import { readJson, removeLocal, writeJson } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'access_token';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAppUser(value: unknown): value is AppUser {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['email'] === 'string' &&
    (v['role'] === 'USER' || v['role'] === 'MANAGER' || v['role'] === 'ADMIN')
  );
}

export interface Credentials {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

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

  constructor() {
    this.restore();
  }

  /**
   * Restores the session defensively: anything unparseable or shape-invalid is
   * cleared and we continue to a usable screen. Never throws.
   */
  private restore(): void {
    const stored = readJson<AppUser>(USER_KEY, isAppUser);
    if (stored) {
      this.user.set(stored);
      return;
    }
    removeLocal(TOKEN_KEY);
    if (COLOSSUS_PREVIEW) {
      // Preview sessions are treated as already signed in so every authenticated
      // route renders on a cold, direct load. `/login` stays reachable because
      // guestGuard does not redirect in preview.
      this.seedSession('ADMIN');
    }
  }

  private seedSession(role: Role): AppUser {
    const user: AppUser = {
      id: 'usr_demo_01',
      email: 'demo.customer@example.com',
      name: 'Dana Reyes',
      role,
      createdAt: '2026-02-14T09:12:00.000Z',
    };
    this.user.set(user);
    writeJson(USER_KEY, user);
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
      this.seedSession('ADMIN');
      await this.router.navigate(['/quotes']);
      return;
    }
    const res = await firstValueFrom(
      this.http.post<{ user: AppUser; accessToken: string }>('/api/auth/login', creds),
    );
    this.applySession(res.user, res.accessToken);
    await this.router.navigate(['/quotes']);
  }

  async register(input: Credentials & { name: string }): Promise<void> {
    if (COLOSSUS_PREVIEW) {
      const user = this.seedSession('ADMIN');
      writeJson(USER_KEY, { ...user, name: input.name.trim() || user.name, email: input.email.trim() });
      this.user.set({ ...user, name: input.name.trim() || user.name, email: input.email.trim() });
      await this.router.navigate(['/quotes']);
      return;
    }
    const res = await firstValueFrom(
      this.http.post<{ user: AppUser; accessToken: string }>('/api/auth/register', input),
    );
    this.applySession(res.user, res.accessToken);
    await this.router.navigate(['/quotes']);
  }

  /** Preview-only: seeds the signed-in state with no credentials at all. */
  async previewSignIn(): Promise<void> {
    if (!COLOSSUS_PREVIEW) return;
    this.seedSession('ADMIN');
    await this.router.navigate(['/quotes']);
  }

  private applySession(user: AppUser, accessToken: string): void {
    this.user.set(user);
    writeJson(USER_KEY, user);
    writeJson(TOKEN_KEY, accessToken);
  }

  async logout(): Promise<void> {
    this.user.set(null);
    removeLocal(USER_KEY);
    removeLocal(TOKEN_KEY);
    await this.router.navigate(['/login']);
  }
}
