import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-account',
  imports: [FormsModule, RouterLink],
  templateUrl: './account.component.html',
  styleUrl: './account.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  readonly auth = inject(AuthService);
  readonly branding = inject(BrandingService);

  name = this.auth.currentUser()?.name ?? '';
  email = this.auth.currentUser()?.email ?? '';

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  readonly profileSaved = signal(false);
  readonly passwordSaved = signal(false);
  readonly passwordError = signal<string | null>(null);

  saveProfile(): void {
    this.profileSaved.set(true);
    setTimeout(() => this.profileSaved.set(false), 2600);
  }

  changePassword(): void {
    this.passwordError.set(null);
    if (this.newPassword.length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set('The new passwords do not match.');
      return;
    }
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordSaved.set(true);
    setTimeout(() => this.passwordSaved.set(false), 2600);
  }

  signOut(): void {
    void this.auth.logout();
  }
}
