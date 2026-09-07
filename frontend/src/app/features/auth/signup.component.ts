import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-signup',
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './auth.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  readonly branding = inject(BrandingService);

  name = '';
  email = '';
  password = '';
  confirm = '';

  readonly errors = signal<Record<string, string>>({});
  readonly formError = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly previewShortcut = this.auth.previewShortcut;

  async submit(): Promise<void> {
    this.formError.set(null);
    const errors = this.auth.validate({ email: this.email, password: this.password });
    if (!this.name.trim()) errors['name'] = 'Enter your name.';
    if (this.confirm !== this.password) errors['confirm'] = 'Passwords do not match.';
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.formError.set('Check the highlighted fields and try again.');
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.register({ name: this.name.trim(), email: this.email.trim(), password: this.password });
    } catch {
      this.formError.set('An account with that email address already exists.');
    } finally {
      this.submitting.set(false);
    }
  }

  useShortcut(): void {
    void this.auth.previewSignIn();
  }
}
