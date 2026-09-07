import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-business-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './business-shell.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessShellComponent {
  readonly tabs = [
    { path: '/admin/business/branding', label: 'Branding' },
    { path: '/admin/business/contact', label: 'Contact' },
    { path: '/admin/business/payments', label: 'Payments' },
    { path: '/admin/business/shipping', label: 'Shipping' },
  ];
}
