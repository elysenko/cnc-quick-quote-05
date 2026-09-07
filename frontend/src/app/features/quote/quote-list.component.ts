import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Quote, QuoteStatus, money } from '../../core/models';

const PAGE_SIZE = 6;

@Component({
  selector: 'app-quote-list',
  imports: [RouterLink],
  templateUrl: './quote-list.component.html',
  styleUrl: './quote-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuoteListComponent {
  /** Bound from `?status`, `?page` and `?sort` by withComponentInputBinding. */
  readonly status = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly sort = input<string | undefined>();

  readonly money = money;
  readonly loading = signal(false);

  readonly quotes = signal<Quote[]>([
    { id: 'qte_2418', reference: 'Q-2609-1348', drawingId: 'dwg_8f31c2', drawingName: 'mounting-bracket-rev-c.dxf', materialId: 'mat_ms16', materialName: 'Mild Steel 1.6 mm', quantity: 24, bendCount: 2, cutLengthMm: 21840, sheetCount: 1, utilization: 0.31, totalCents: 41255, status: 'draft', createdAt: '2026-09-05T14:24:00.000Z' },
    { id: 'qte_2402', reference: 'Q-2608-1291', drawingId: 'dwg_71ab90', drawingName: 'gusset-plate.dxf', materialId: 'mat_ms30', materialName: 'Mild Steel 3.0 mm', quantity: 60, bendCount: 0, cutLengthMm: 43200, sheetCount: 2, utilization: 0.58, totalCents: 78940, status: 'ordered', createdAt: '2026-08-28T09:11:00.000Z' },
    { id: 'qte_2377', reference: 'Q-2608-1244', drawingId: 'dwg_5c2d13', drawingName: 'enclosure-lid.dxf', materialId: 'mat_al30', materialName: 'Aluminium 5052 3.0 mm', quantity: 12, bendCount: 4, cutLengthMm: 15600, sheetCount: 1, utilization: 0.22, totalCents: 36480, status: 'draft', createdAt: '2026-08-21T16:02:00.000Z' },
    { id: 'qte_2350', reference: 'Q-2607-1198', drawingId: 'dwg_44ee81', drawingName: 'shelf-support.dxf', materialId: 'mat_ss20', materialName: 'Stainless 304 2.0 mm', quantity: 150, bendCount: 1, cutLengthMm: 96000, sheetCount: 4, utilization: 0.71, totalCents: 213500, status: 'ordered', createdAt: '2026-07-30T11:47:00.000Z' },
    { id: 'qte_2318', reference: 'Q-2607-1150', drawingId: 'dwg_2fa004', drawingName: 'cable-tray-end.dxf', materialId: 'mat_ms16', materialName: 'Mild Steel 1.6 mm', quantity: 8, bendCount: 3, cutLengthMm: 6400, sheetCount: 1, utilization: 0.09, totalCents: 9500, status: 'expired', createdAt: '2026-07-12T08:20:00.000Z' },
    { id: 'qte_2290', reference: 'Q-2606-1102', drawingId: 'dwg_99bc27', drawingName: 'trim-panel.dxf', materialId: 'mat_bz15', materialName: 'Brass C260 1.5 mm', quantity: 30, bendCount: 0, cutLengthMm: 27000, sheetCount: 3, utilization: 0.64, totalCents: 128760, status: 'draft', createdAt: '2026-06-25T13:33:00.000Z' },
    { id: 'qte_2261', reference: 'Q-2606-1054', drawingId: 'dwg_10df55', drawingName: 'spacer-ring.dxf', materialId: 'mat_ms30', materialName: 'Mild Steel 3.0 mm', quantity: 200, bendCount: 0, cutLengthMm: 62800, sheetCount: 2, utilization: 0.44, totalCents: 96300, status: 'ordered', createdAt: '2026-06-09T10:05:00.000Z' },
  ]);

  readonly statusFilters: Array<{ value: string; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'draft', label: 'Draft' },
    { value: 'ordered', label: 'Ordered' },
    { value: 'expired', label: 'Expired' },
  ];

  readonly activeStatus = computed(() => this.status() ?? 'all');
  readonly activeSort = computed(() => this.sort() ?? 'newest');
  readonly currentPage = computed(() => Math.max(1, Number(this.page() ?? '1') || 1));

  private readonly filtered = computed(() => {
    const status = this.activeStatus();
    const list = status === 'all' ? this.quotes() : this.quotes().filter((q) => q.status === status);
    const sorted = [...list];
    switch (this.activeSort()) {
      case 'oldest':
        sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case 'total':
        sorted.sort((a, b) => b.totalCents - a.totalCents);
        break;
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly visible = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  readonly resultCount = computed(() => this.filtered().length);

  badgeClass(status: QuoteStatus): string {
    if (status === 'ordered') return 'badge badge-ok';
    if (status === 'expired') return 'badge';
    return 'badge badge-info';
  }

  queryFor(patch: Record<string, string>): Record<string, string> {
    return { status: this.activeStatus(), sort: this.activeSort(), page: String(this.currentPage()), ...patch };
  }
}
