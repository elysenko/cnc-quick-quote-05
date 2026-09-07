import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/admin.service';
import { BrandingService } from '../../core/branding.service';
import { toAppError } from '../../core/errors';
import { BusinessConfig } from '../../core/models';

type BrandingForm = Pick<BusinessConfig, 'companyName' | 'primaryColor' | 'accentColor'>;

@Component({
  selector: 'app-admin-branding',
  imports: [FormsModule],
  templateUrl: './branding.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandingComponent {
  private readonly api = inject(AdminApi);
  private readonly branding = inject(BrandingService);

  readonly form = signal<BrandingForm>({
    companyName: this.branding.business().companyName,
    primaryColor: this.branding.business().primaryColor,
    accentColor: this.branding.business().accentColor,
  });

  readonly logoFile = signal<File | null>(null);
  readonly logoName = signal<string | null>(null);
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
      this.form.set({
        companyName: config.companyName,
        primaryColor: config.primaryColor,
        accentColor: config.accentColor,
      });
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  patch<K extends keyof BrandingForm>(key: K, value: BrandingForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.touch();
  }

  touch(): void {
    this.dirty.set(true);
    this.saved.set(false);
  }

  onLogo(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.logoFile.set(file);
      this.logoName.set(file.name);
      this.touch();
    }
  }

  /** Applies immediately so the reviewer sees the whole shell re-theme. */
  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(this.api.saveBusiness({ ...this.form() }));
      let config = result.config;

      const file = this.logoFile();
      if (file) {
        config = await firstValueFrom(this.api.uploadLogo(file));
        this.logoFile.set(null);
      }

      this.branding.update(config);
      this.dirty.set(false);
      this.saved.set(true);
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.saving.set(false);
    }
  }
}
