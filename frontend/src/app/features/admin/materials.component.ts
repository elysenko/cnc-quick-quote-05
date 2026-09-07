import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Material } from '../../core/models';

@Component({
  selector: 'app-admin-materials',
  imports: [FormsModule, RouterLink],
  templateUrl: './materials.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialsComponent {
  /** `?modal=material-edit&id=…` — modal state lives in the URL so it is deep-linkable. */
  readonly modal = input<string | undefined>();
  readonly id = input<string | undefined>();

  readonly materials = signal<Material[]>([
    { id: 'mat_ms16', name: 'Mild Steel', thicknessMm: 1.6, sheetWMm: 2500, sheetHMm: 1250, costMultiplier: 1.0, isActive: true },
    { id: 'mat_ms30', name: 'Mild Steel', thicknessMm: 3.0, sheetWMm: 2500, sheetHMm: 1250, costMultiplier: 1.45, isActive: true },
    { id: 'mat_ss20', name: 'Stainless 304', thicknessMm: 2.0, sheetWMm: 2000, sheetHMm: 1000, costMultiplier: 2.35, isActive: true },
    { id: 'mat_al30', name: 'Aluminium 5052', thicknessMm: 3.0, sheetWMm: 2500, sheetHMm: 1250, costMultiplier: 1.85, isActive: true },
    { id: 'mat_bz15', name: 'Brass C260', thicknessMm: 1.5, sheetWMm: 1200, sheetHMm: 600, costMultiplier: 3.1, isActive: true },
    { id: 'mat_cu20', name: 'Copper C110', thicknessMm: 2.0, sheetWMm: 1200, sheetHMm: 600, costMultiplier: 4.2, isActive: false },
  ]);

  readonly modalOpen = computed(() => this.modal() === 'material-edit');
  readonly editing = computed(() => this.materials().find((m) => m.id === this.id()) ?? null);
  readonly modalTitle = computed(() => (this.editing() ? 'Edit material' : 'Add material'));

  readonly draft = signal<Material>(this.blank());

  private blank(): Material {
    return { id: '', name: '', thicknessMm: 1.6, sheetWMm: 2500, sheetHMm: 1250, costMultiplier: 1, isActive: true };
  }

  constructor() {
    // Keep the form in step with whichever material the URL points at.
    queueMicrotask(() => this.syncDraft());
  }

  syncDraft(): void {
    this.draft.set(this.editing() ? { ...this.editing()! } : this.blank());
  }

  patch<K extends keyof Material>(key: K, value: Material[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  save(): void {
    const d = this.draft();
    if (d.id) {
      this.materials.update((list) => list.map((m) => (m.id === d.id ? { ...d } : m)));
    } else {
      this.materials.update((list) => [...list, { ...d, id: `mat_new${list.length}` }]);
    }
  }

  /** Never hard-deleted — quote history must stay intact. */
  toggleActive(material: Material): void {
    this.materials.update((list) =>
      list.map((m) => (m.id === material.id ? { ...m, isActive: !m.isActive } : m)),
    );
  }
}
