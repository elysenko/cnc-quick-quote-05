import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DraftStore } from '../../core/draft-store';

@Component({
  selector: 'app-material-step',
  imports: [FormsModule],
  templateUrl: './material-step.component.html',
  styleUrl: './material-step.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialStepComponent {
  private readonly router = inject(Router);
  readonly draft = inject(DraftStore);

  readonly drawing = this.draft.drawing;
  readonly materials = this.draft.materials;
  readonly machine = this.draft.machine;
  readonly nesting = this.draft.nesting;
  readonly material = this.draft.material;

  readonly quantityInput = signal<number>(this.draft.quantity());

  constructor() {
    // Materials and the machine's quantity bounds come from the admin config.
    void this.draft.restore().then(() => this.quantityInput.set(this.draft.quantity()));
  }

  readonly quantityError = computed(() => {
    const qty = this.quantityInput();
    const cfg = this.machine();
    if (!Number.isFinite(qty) || qty === null) return 'Enter a quantity.';
    if (qty < cfg.minQuantity) return `Minimum order quantity is ${cfg.minQuantity}.`;
    if (qty > cfg.maxQuantity) return `Maximum order quantity is ${cfg.maxQuantity}.`;
    if (!Number.isInteger(qty)) return 'Quantity must be a whole number.';
    return null;
  });

  readonly fitsSheet = computed(() => this.nesting() !== null);

  readonly canContinue = computed(() => this.quantityError() === null && this.fitsSheet());

  onMaterialChange(id: string): void {
    this.draft.setMaterial(id);
  }

  onQuantityChange(value: number): void {
    this.quantityInput.set(value);
    if (this.quantityError() === null) this.draft.setQuantity(value);
  }

  back(): void {
    void this.router.navigate(['/quotes/new/bends']);
  }

  next(): void {
    if (!this.canContinue()) return;
    void this.router.navigate(['/quotes/new/result']);
  }
}
