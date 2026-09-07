import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from './core/auth.service';
import { BrandingService } from './core/branding.service';

interface NavItem {
  label: string;
  short: string;
  path: string;
  icon: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly branding = inject(BrandingService);

  readonly menuOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Auth screens render standalone — no chrome, no nav. */
  readonly chromeless = computed(() => /^\/(login|signup)(\?|$)/.test(this.url()));

  readonly navItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [
      { label: 'Quotes', short: 'Quotes', path: '/quotes', icon: '⬡' },
      { label: 'Orders', short: 'Orders', path: '/orders', icon: '▤' },
      { label: 'Account', short: 'Account', path: '/account', icon: '◉' },
    ];
    if (this.auth.isAdmin()) {
      items.push({ label: 'Admin', short: 'Admin', path: '/admin', icon: '⚙', adminOnly: true });
    }
    return items;
  });

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  signOut(): void {
    this.closeMenu();
    void this.auth.logout();
  }
}
