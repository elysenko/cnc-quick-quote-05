import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/admin.service';
import { BrandingService } from '../../core/branding.service';
import { toAppError } from '../../core/errors';
import { BusinessConfig } from '../../core/models';

@Component({
  selector: 'app-admin-contact',
  imports: [FormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  private readonly api = inject(AdminApi);
  private readonly branding = inject(BrandingService);

  // Two screens (branding, contact) over the same BusinessConfig resource — both
  // load the full record from GET /admin/business and PATCH only their own fields.
  readonly form = signal<BusinessConfig>({ ...this.branding.business() });
  readonly dirty = signal(false);
  readonly saved = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const config = await firstValueFrom(this.api.business());
      this.form.set({ ...config });
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  patch<K extends keyof BusinessConfig>(key: K, value: BusinessConfig[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.dirty.set(true);
    this.saved.set(false);
  }

  async save(): Promise<void> {
    const f = this.form();
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.api.saveBusiness({
          supportEmail: f.supportEmail,
          phone: f.phone,
          addressLine1: f.addressLine1,
          addressLine2: f.addressLine2,
          city: f.city,
          region: f.region,
          postcode: f.postcode,
          country: f.country,
        }),
      );
      this.form.set({ ...result.config });
      this.branding.update(result.config);
      this.dirty.set(false);
      this.saved.set(true);
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.saving.set(false);
    }
  }
}
