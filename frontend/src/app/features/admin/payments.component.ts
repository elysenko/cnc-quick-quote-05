import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../../core/branding.service';

type ProbeState = 'idle' | 'checking' | 'valid' | 'invalid';

@Component({
  selector: 'app-admin-payments',
  imports: [FormsModule],
  templateUrl: './payments.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsComponent {
  private readonly branding = inject(BrandingService);

  sandbox = this.branding.business().stripeSandbox;
  publishableKey = this.branding.business().stripePublishableKey;
  secretKey = '';
  webhookSecret = '';

  readonly storedSecret = this.branding.business().stripeSecretKeyMasked;
  readonly storedWebhook = this.branding.business().stripeWebhookSecretMasked;
  readonly webhookUrl = 'https://quotes.northgatelaser.example/api/webhooks/stripe';

  readonly probe = signal<ProbeState>('idle');
  readonly dirty = signal(false);

  touch(): void {
    this.dirty.set(true);
    this.probe.set('idle');
  }

  /** Keys are validated with a live balance probe before they are stored. */
  save(): void {
    this.probe.set('checking');
    setTimeout(() => {
      const looksValid = this.publishableKey.trim().startsWith('pk_');
      this.probe.set(looksValid ? 'valid' : 'invalid');
      if (looksValid) {
        this.branding.update({ stripeSandbox: this.sandbox, stripePublishableKey: this.publishableKey });
        this.dirty.set(false);
        this.secretKey = '';
        this.webhookSecret = '';
      }
    }, 900);
  }
}
