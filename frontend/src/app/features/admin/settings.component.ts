import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingEntry } from '../../core/models';

@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly settings = signal<SettingEntry[]>([
    { key: 'postgresql', label: 'PostgreSQL', kind: 'service', description: 'Primary application database.', maskedValue: 'postgres://••••••@app-db:5432/cnc', configured: true },
    { key: 'minio', label: 'MinIO', kind: 'service', description: 'Object storage service for drawings and receipts.', maskedValue: 'http://minio:9000', configured: true },
    { key: 'STRIPE_SDK_PYTHON_STRIPE_15_6_API_KEY', label: 'Stripe SDK (Python stripe 15.6)', kind: 'integration', description: 'Card payments via Stripe Checkout, plus webhook verification.', maskedValue: '', configured: false },
    { key: 'RESEND_API_RESEND_2_43_API_KEY', label: 'Resend API (resend 2.43)', kind: 'integration', description: 'Transactional order-confirmation email with receipt.', maskedValue: '', configured: false },
    { key: 'MINIO_S3_MINIO_7_2_20_API_KEY', label: 'MinIO / S3 (minio 7.2.20)', kind: 'integration', description: 'Uploaded DXF files, logo assets and presigned downloads.', maskedValue: '', configured: false },
  ]);

  readonly drafts = signal<Record<string, string>>({});
  readonly savedKey = signal<string | null>(null);

  readonly services = computed(() => this.settings().filter((s) => s.kind === 'service'));
  readonly integrations = computed(() => this.settings().filter((s) => s.kind === 'integration'));

  readonly unconfigured = computed(() => this.settings().filter((s) => !s.configured));

  readonly bannerText = computed(() => {
    const names = this.unconfigured().map((s) => s.label);
    return names.length === 0 ? '' : `The following need credentials to activate: ${names.join(', ')}.`;
  });

  value(key: string): string {
    return this.drafts()[key] ?? '';
  }

  setValue(key: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [key]: value }));
    this.savedKey.set(null);
  }

  save(entry: SettingEntry): void {
    const value = this.value(entry.key).trim();
    if (!value) return;
    this.settings.update((list) =>
      list.map((s) =>
        s.key === entry.key
          ? { ...s, configured: true, maskedValue: `${value.slice(0, 6)}${'•'.repeat(18)}${value.slice(-4)}` }
          : s,
      ),
    );
    this.drafts.update((d) => ({ ...d, [entry.key]: '' }));
    this.savedKey.set(entry.key);
  }
}
