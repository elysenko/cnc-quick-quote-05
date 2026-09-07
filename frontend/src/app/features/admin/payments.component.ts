import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi, BusinessUpdate } from '../../core/api/admin.service';
import { BrandingService } from '../../core/branding.service';
import { toAppError } from '../../core/errors';

type ProbeState = 'idle' | 'checking' | 'valid' | 'invalid';

@Component({
  selector: 'app-admin-payments',
  imports: [FormsModule],
  templateUrl: './payments.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsComponent {
  private readonly api = inject(AdminApi);
  private readonly branding = inject(BrandingService);

  readonly sandbox = signal(this.branding.business().stripeSandbox);
  readonly publishableKey = signal(this.branding.business().stripePublishableKey);
  readonly secretKey = signal('');
  readonly webhookSecret = signal('');

  readonly storedSecret = signal(this.branding.business().stripeSecretKeyMasked);
  readonly storedWebhook = signal(this.branding.business().stripeWebhookSecretMasked);
  readonly webhookUrl = 'https://quotes.northgatelaser.example/api/webhooks/stripe';

  readonly probe = signal<ProbeState>('idle');
  /** Message from the server's live Stripe probe — used for both the ok and fail states. */
  readonly probeMessage = signal<string | null>(null);
  readonly dirty = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const config = await firstValueFrom(this.api.business());
      this.sandbox.set(config.stripeSandbox);
      this.publishableKey.set(config.stripePublishableKey);
      this.storedSecret.set(config.stripeSecretKeyMasked);
      this.storedWebhook.set(config.stripeWebhookSecretMasked);
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  setSandbox(value: boolean): void {
    this.sandbox.set(value);
    this.touch();
  }

  setPublishableKey(value: string): void {
    this.publishableKey.set(value);
    this.touch();
  }

  setSecretKey(value: string): void {
    this.secretKey.set(value);
    this.touch();
  }

  setWebhookSecret(value: string): void {
    this.webhookSecret.set(value);
    this.touch();
  }

  touch(): void {
    this.dirty.set(true);
    this.probe.set('idle');
    this.probeMessage.set(null);
  }

  /**
   * Keys are validated with a live probe against Stripe before they are stored.
   * As of the latest backend change, a failed probe rejects the whole save with
   * a 400 rather than saving anyway with probe.ok === false, so both the success
   * response's `probe` field AND the HTTP error path need handling here.
   */
  async save(): Promise<void> {
    this.probe.set('checking');
    this.error.set(null);
    this.probeMessage.set(null);

    const patch: BusinessUpdate = {
      stripeSandbox: this.sandbox(),
      stripePublishableKey: this.publishableKey(),
    };
    const secret = this.secretKey().trim();
    const webhook = this.webhookSecret().trim();
    if (secret) patch.stripeSecretKey = secret;
    if (webhook) patch.stripeWebhookSecret = webhook;

    try {
      const result = await firstValueFrom(this.api.saveBusiness(patch));
      this.branding.update(result.config);
      this.storedSecret.set(result.config.stripeSecretKeyMasked);
      this.storedWebhook.set(result.config.stripeWebhookSecretMasked);
      this.dirty.set(false);
      this.secretKey.set('');
      this.webhookSecret.set('');

      if (result.probe) {
        this.probeMessage.set(result.probe.message);
        this.probe.set(result.probe.ok ? 'valid' : 'invalid');
      } else {
        this.probe.set('idle');
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 400) {
        // The probe rejected the new secret key — nothing was saved.
        this.probeMessage.set(toAppError(err).message);
        this.probe.set('invalid');
      } else {
        this.error.set(toAppError(err).message);
        this.probe.set('idle');
      }
    }
  }
}
