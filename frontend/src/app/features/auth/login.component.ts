import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './auth.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly branding = inject(BrandingService);

  email = '';
  password = '';

  readonly errors = signal<Record<string, string>>({});
  readonly formError = signal<string | null>(null);
  readonly submitting = signal(false);

  /** Null in production builds — the whole affordance is compiled out. */
  readonly previewShortcut = this.auth.previewShortcut;

  async submit(): Promise<void> {
    this.formError.set(null);
    const errors = this.auth.validate({ email: this.email, password: this.password });
    this.errors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.formError.set('Check the highlighted fields and try again.');
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.login({ email: this.email.trim(), password: this.password });
      await this.goToReturnUrl();
    } catch {
      this.formError.set('That email and password combination was not recognised.');
    } finally {
      this.submitting.set(false);
    }
  }

  async useShortcut(): Promise<void> {
    await this.auth.previewSignIn();
    await this.goToReturnUrl();
  }

  private async goToReturnUrl(): Promise<void> {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
      await this.router.navigateByUrl(returnUrl);
    }
  }
}
