import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/admin.service';
import { toAppError } from '../../core/errors';
import { ShippingKind, ShippingMethod } from '../../core/models';

@Component({
  selector: 'app-admin-shipping-methods',
  imports: [FormsModule, RouterLink],
  templateUrl: './shipping-methods.component.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingMethodsComponent {
  private readonly api = inject(AdminApi);

  /** `?modal=shipping-method&id=…` — deep-linkable create/edit state. */
  readonly modal = input<string | undefined>();
  readonly id = input<string | undefined>();

  readonly methods = signal<ShippingMethod[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly modalOpen = computed(() => this.modal() === 'shipping-method');
  readonly editing = computed(() => this.methods().find((m) => m.id === this.id()) ?? null);
  readonly modalTitle = computed(() => (this.editing() ? 'Edit delivery method' : 'Add delivery method'));
  readonly activeCount = computed(() => this.methods().filter((m) => m.isActive).length);

  readonly draft = signal<ShippingMethod>(this.blank());

  private blank(): ShippingMethod {
    return { id: '', name: '', kind: 'flat', rate: 0, estDays: 3, isActive: true };
  }

  constructor() {
    void this.load();
    // Keep the form in step with whichever method the URL points at, including
    // once the real list has finished loading (deep link to an edit modal).
    effect(() => {
      this.modal();
      this.id();
      this.methods();
      this.syncDraft();
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.methods.set(await firstValueFrom(this.api.shippingMethods()));
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

  patch<K extends keyof ShippingMethod>(key: K, value: ShippingMethod[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  setKind(kind: ShippingKind): void {
    this.patch('kind', kind);
  }

  async save(): Promise<void> {
    const d = this.draft();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      if (d.id) {
        const { id, resolvedCostCents, ...patch } = d;
        const updated = await firstValueFrom(this.api.updateShippingMethod(id, patch));
        this.methods.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
      } else {
        const { id, resolvedCostCents, ...input } = d;
        const created = await firstValueFrom(this.api.createShippingMethod(input));
        this.methods.update((list) => [...list, created]);
      }
    } catch (err) {
      this.saveError.set(toAppError(err).message);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(method: ShippingMethod): Promise<void> {
    try {
      const updated = await firstValueFrom(
        this.api.updateShippingMethod(method.id, { isActive: !method.isActive }),
      );
      this.methods.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
    } catch (err) {
      this.error.set(toAppError(err).message);
    }
  }
}
