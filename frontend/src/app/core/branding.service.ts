import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BusinessConfig } from './models';
import { apiUrl } from './api-base';

/**
 * Neutral starting values used only for the instant between bootstrap and the
 * first response from /api/business. Every field is replaced by the
 * administrator's real configuration as soon as it arrives.
 */
const INITIAL: BusinessConfig = {
  companyName: 'CNC Quick Quote',
  supportEmail: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postcode: '',
  country: '',
  logoUrl: null,
  primaryColor: '#1e4fd8',
  accentColor: '#ea6a0c',
  stripeSandbox: true,
  stripePublishableKey: '',
  stripeSecretKeyMasked: '',
  stripeWebhookSecretMasked: '',
};

/**
 * Owns the customer-facing brand identity, loaded from the admin-configured
 * BusinessConfig. Applies the colours as CSS custom properties on :root so the
 * entire shell re-themes at runtime, and exposes the company block as signals
 * for the confirmation and receipt views.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly http = inject(HttpClient);

  readonly business = signal<BusinessConfig>(INITIAL);

  readonly companyName = computed(() => this.business().companyName);
  readonly initials = computed(() =>
    this.companyName()
      .split(/\s+/)
      .filter((w) => /[a-z]/i.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join(''),
  );

  readonly addressLines = computed(() => {
    const b = this.business();
    const locality = [b.city, b.region, b.postcode].filter((p) => p && p.trim()).join(', ');
    return [b.addressLine1, b.addressLine2, locality, b.country].filter(
      (line): line is string => !!line && line.trim().length > 0,
    );
  });

  constructor() {
    void this.load();
  }

  /**
   * Branding is a public endpoint so the login screen carries the shop's
   * identity before a session exists. A failure leaves the neutral defaults in
   * place — the app must still render.
   */
  async load(): Promise<void> {
    try {
      const config = await firstValueFrom(
        this.http.get<BusinessConfig>(apiUrl('/business')),
      );
      this.business.set({ ...INITIAL, ...config });
      this.applyTheme();
    } catch {
      this.applyTheme();
    }
  }

  /** Applies a locally-edited patch (admin forms) and re-themes immediately. */
  update(patch: Partial<BusinessConfig>): void {
    this.business.update((b) => ({ ...b, ...patch }));
    this.applyTheme();
  }

  /** Pushes brand colours onto the document root as CSS custom properties. */
  applyTheme(): void {
    if (typeof document === 'undefined') return;
    const b = this.business();
    const root = document.documentElement.style;
    root.setProperty('--brand-primary', b.primaryColor);
    root.setProperty('--brand-accent', b.accentColor);
    root.setProperty('--machine-cut', b.primaryColor);
    root.setProperty('--machine-bend', b.accentColor);
  }
}
