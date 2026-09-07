import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-admin-branding',
  imports: [FormsModule],
  templateUrl: './branding.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandingComponent {
  readonly branding = inject(BrandingService);

  companyName = this.branding.business().companyName;
  primaryColor = this.branding.business().primaryColor;
  accentColor = this.branding.business().accentColor;

  readonly logoName = signal<string | null>(null);
  readonly dirty = signal(false);
  readonly saved = signal(false);

  touch(): void {
    this.dirty.set(true);
    this.saved.set(false);
  }

  onLogo(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.logoName.set(file.name);
      this.touch();
    }
  }

  /** Applies immediately so the reviewer sees the whole shell re-theme. */
  save(): void {
    this.branding.update({
      companyName: this.companyName,
      primaryColor: this.primaryColor,
      accentColor: this.accentColor,
    });
    this.dirty.set(false);
    this.saved.set(true);
  }
}
