import { Injectable, computed, signal } from '@angular/core';
import { BusinessConfig } from './models';
import { readJson, writeJson } from './storage';

const BRANDING_KEY = 'branding';

function isBusinessConfig(value: unknown): value is BusinessConfig {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['companyName'] === 'string' &&
    typeof v['primaryColor'] === 'string' &&
    typeof v['accentColor'] === 'string' &&
    typeof v['supportEmail'] === 'string'
  );
}

/**
 * Owns the customer-facing brand identity. Applies the admin-configured colours
 * as CSS custom properties on :root so the entire shell re-themes at runtime,
 * and exposes the company block as signals for the confirmation views.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  readonly business = signal<BusinessConfig>({
    companyName: 'Northgate Laser & Fabrication',
    supportEmail: 'quotes@northgatelaser.example',
    phone: '(414) 555-0182',
    addressLine1: '2140 Foundry Row',
    addressLine2: 'Building C',
    city: 'Milwaukee',
    region: 'WI',
    postcode: '53204',
    country: 'United States',
    logoUrl: null,
    primaryColor: '#1e4fd8',
    accentColor: '#ea6a0c',
    stripeSandbox: true,
    stripePublishableKey: 'pk_test_51NqXvBK8••••••••••••••••4Rt2',
    stripeSecretKeyMasked: 'sk_test_••••••••••••••••••••9fQz',
    stripeWebhookSecretMasked: 'whsec_••••••••••••••••••••7bLm',
  });

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
    return [b.addressLine1, b.addressLine2, `${b.city}, ${b.region} ${b.postcode}`, b.country].filter(
      (line): line is string => !!line && line.trim().length > 0,
    );
  });

  constructor() {
    // Restore defensively: an unrecognised value is cleared by readJson and we
    // fall through to the built-in defaults rather than throwing on boot.
    const saved = readJson<BusinessConfig>(BRANDING_KEY, isBusinessConfig);
    if (saved) this.business.set({ ...this.business(), ...saved });
    this.applyTheme();
  }

  update(patch: Partial<BusinessConfig>): void {
    this.business.update((b) => ({ ...b, ...patch }));
    writeJson(BRANDING_KEY, this.business());
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
