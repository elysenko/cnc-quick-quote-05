import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../../core/branding.service';
import { BusinessConfig } from '../../core/models';

@Component({
  selector: 'app-admin-contact',
  imports: [FormsModule],
  templateUrl: './contact.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactComponent {
  private readonly branding = inject(BrandingService);

  readonly form = signal<BusinessConfig>({ ...this.branding.business() });
  readonly dirty = signal(false);
  readonly saved = signal(false);

  patch<K extends keyof BusinessConfig>(key: K, value: BusinessConfig[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.dirty.set(true);
    this.saved.set(false);
  }

  save(): void {
    this.branding.update(this.form());
    this.dirty.set(false);
    this.saved.set(true);
  }
}
