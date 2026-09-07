import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  readonly sections = [
    { path: '/admin/materials', label: 'Materials' },
    { path: '/admin/pricing', label: 'Pricing' },
    { path: '/admin/machine', label: 'Machine' },
    { path: '/admin/business', label: 'Business' },
    { path: '/admin/orders', label: 'Orders' },
    { path: '/admin/settings', label: 'Settings' },
  ];
}
