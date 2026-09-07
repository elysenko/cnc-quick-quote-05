import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/admin.service';
import { toAppError } from '../../core/errors';
import { Material } from '../../core/models';

@Component({
  selector: 'app-admin-materials',
  imports: [FormsModule, RouterLink],
  templateUrl: './materials.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialsComponent {
  private readonly api = inject(AdminApi);

  /** `?modal=material-edit&id=…` — modal state lives in the URL so it is deep-linkable. */
  readonly modal = input<string | undefined>();
  readonly id = input<string | undefined>();

  readonly materials = signal<Material[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly modalOpen = computed(() => this.modal() === 'material-edit');
  readonly editing = computed(() => this.materials().find((m) => m.id === this.id()) ?? null);
  readonly modalTitle = computed(() => (this.editing() ? 'Edit material' : 'Add material'));

  readonly draft = signal<Material>(this.blank());

  private blank(): Material {
    return { id: '', name: '', thicknessMm: 1.6, sheetWMm: 2500, sheetHMm: 1250, costMultiplier: 1, isActive: true };
  }

  constructor() {
    void this.load();
    // Keep the form in step with whichever material the URL points at, including
    // once the real list has finished loading (deep link to an edit modal).
    effect(() => {
      this.modal();
      this.id();
      this.materials();
      this.syncDraft();
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.materials.set(await firstValueFrom(this.api.materials()));
    } catch (err) {
      this.error.set(toAppError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  syncDraft(): void {
    this.draft.set(this.editing() ? { ...this.editing()! } : this.blank());
    this.saveError.set(null);
  }

  patch<K extends keyof Material>(key: K, value: Material[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  async save(): Promise<void> {
    const d = this.draft();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      if (d.id) {
        const { id, ...patch } = d;
        const updated = await firstValueFrom(this.api.updateMaterial(id, patch));
        this.materials.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
      } else {
        const { id, ...input } = d;
        const created = await firstValueFrom(this.api.createMaterial(input));
        this.materials.update((list) => [...list, created]);
      }
    } catch (err) {
      this.saveError.set(toAppError(err).message);
    } finally {
      this.saving.set(false);
    }
  }

  /** Never hard-deleted — quote history must stay intact. */
  async toggleActive(material: Material): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.api.updateMaterial(material.id, { isActive: !material.isActive }),
      );
      this.materials.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
    } catch (err) {
      this.error.set(toAppError(err).message);
    }
  }
}
