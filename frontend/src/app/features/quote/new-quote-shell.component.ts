import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { DraftStore } from '../../core/draft-store';

interface Step {
  key: string;
  label: string;
  path: string;
}

@Component({
  selector: 'app-new-quote-shell',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './new-quote-shell.component.html',
  styleUrl: './new-quote-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewQuoteShellComponent {
  private readonly router = inject(Router);
  readonly draft = inject(DraftStore);

  readonly steps: Step[] = [
    { key: 'upload', label: 'Upload drawing', path: '/quotes/new/upload' },
    { key: 'bends', label: 'Place bends', path: '/quotes/new/bends' },
    { key: 'material', label: 'Material & quantity', path: '/quotes/new/material' },
    { key: 'result', label: 'Your price', path: '/quotes/new/result' },
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
    const idx = this.steps.findIndex((s) => url.startsWith(s.path));
    return idx === -1 ? 0 : idx;
  });

  constructor() {
    // A deep link to any step past upload restores the persisted draft from the
    // server rather than dead-ending on an empty wizard. When there is nothing
    // to restore we send the customer to the upload step, which is the only
    // step that works without a drawing.
    void this.draft.restore().then((restored) => {
      if (!restored && !this.url().startsWith('/quotes/new/upload')) {
        void this.router.navigate(['/quotes/new/upload']);
      }
    });
  }
}
