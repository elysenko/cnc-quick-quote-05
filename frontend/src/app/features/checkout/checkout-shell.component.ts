import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { BrandingService } from '../../core/branding.service';

@Component({
  selector: 'app-checkout-shell',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './checkout-shell.component.html',
  styleUrl: './checkout-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutShellComponent {
  private readonly router = inject(Router);
  readonly branding = inject(BrandingService);

  readonly quoteId = input<string>('');

  readonly steps = [
    { key: 'review', label: 'Review' },
    { key: 'shipping', label: 'Shipping' },
    { key: 'payment', label: 'Payment' },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly activeIndex = computed(() => {
    const url = this.url();
    const idx = this.steps.findIndex((s) => url.includes(`/${s.key}`));
    return idx === -1 ? 0 : idx;
  });
}
