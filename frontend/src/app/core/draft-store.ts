import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BendLine, Drawing, MachineConfig, Material, PricingConfig } from './models';
import { nest, price } from './estimate';
import { readJson, removeSession, writeJson } from './storage';
import { CatalogApi } from './api/catalog.service';
import { DrawingsApi } from './api/drawings.service';

interface PersistedDraft {
  drawingId: string;
  materialId: string;
  quantity: number;
}

function isPersistedDraft(v: unknown): v is PersistedDraft {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return typeof d['drawingId'] === 'string' && typeof d['materialId'] === 'string' && typeof d['quantity'] === 'number';
}

const DRAFT_KEY = 'quote-draft';

/**
 * Neutral placeholders held only until the first API response lands. Real
 * limits and rates come from the administrator's MachineConfig/PricingConfig.
 */
const MACHINE_FALLBACK: MachineConfig = {
  minQuantity: 1,
  maxQuantity: 500,
  maxUploadBytes: 10 * 1024 * 1024,
  allowedExtensions: ['.dxf'],
  sheetSpacingMm: 6,
  sheetMarginMm: 12,
  animationSpeed: 320,
};

const PRICING_FALLBACK: PricingConfig = {
  setupFee: 0,
  costPerLinearFoot: 0,
  perSheetCost: 0,
  handlingFee: 0,
  costPerBend: 0,
  minimumOrder: 0,
};

/**
 * Wizard state for `/quotes/new/*`.
 *
 * The draft (drawing id, material, quantity) is persisted to sessionStorage so
 * a deep link to any step restores rather than dead-ending; the drawing itself
 * is re-fetched from the server, never reconstructed locally.
 *
 * The nesting and price shown here are a PREVIEW computed with the same
 * formulas the server uses. The binding number is always the one returned by
 * POST /api/quotes, which stores its own pricing snapshot.
 */
@Injectable({ providedIn: 'root' })
export class DraftStore {
  private readonly catalog = inject(CatalogApi);
  private readonly drawingsApi = inject(DrawingsApi);

  readonly drawing = signal<Drawing | null>(null);
  readonly bends = signal<BendLine[]>([]);
  readonly materials = signal<Material[]>([]);
  readonly machine = signal<MachineConfig>(MACHINE_FALLBACK);
  readonly pricing = signal<PricingConfig>(PRICING_FALLBACK);

  readonly materialId = signal<string>('');
  readonly quantity = signal<number>(1);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Non-null once materials have loaded, because the material step's template
   * dereferences `material().sheetWMm` unguarded. Null only in the brief window
   * before the first response, which the template guards with `@if (drawing())`.
   */
  readonly material = computed(
    () => this.materials().find((m) => m.id === this.materialId()) ?? this.materials()[0],
  );

  readonly hasDrawing = computed(() => this.drawing() !== null);

  readonly nesting = computed(() => {
    const dwg = this.drawing();
    const mat = this.material();
    if (!dwg || !mat) return null;
    const cfg = this.machine();
    return nest({
      partW: dwg.bboxWMm,
      partH: dwg.bboxHMm,
      qty: this.quantity(),
      sheetW: mat.sheetWMm,
      sheetH: mat.sheetHMm,
      spacing: cfg.sheetSpacingMm,
      margin: cfg.sheetMarginMm,
    });
  });

  readonly breakdown = computed(() => {
    const dwg = this.drawing();
    const mat = this.material();
    const nesting = this.nesting();
    if (!dwg || !mat || !nesting) return null;
    return price({
      cutLengthMmTotal: dwg.cutLengthMm * this.quantity(),
      bendCountTotal: this.bends().length * this.quantity(),
      sheetCount: nesting.sheetCount,
      materialMultiplier: mat.costMultiplier,
      config: this.pricing(),
    });
  });

  /** True once the quote inputs changed after a price was shown. */
  readonly stale = signal(false);

  private referenceData: Promise<void> | null = null;

  /** Loads materials, machine limits and rates once per session. */
  loadReferenceData(): Promise<void> {
    if (this.referenceData) return this.referenceData;
    this.referenceData = (async () => {
      this.loading.set(true);
      try {
        const [materials, machine, pricing] = await Promise.all([
          firstValueFrom(this.catalog.materials()),
          firstValueFrom(this.catalog.machineConfig()),
          firstValueFrom(this.catalog.pricingConfig()),
        ]);
        this.materials.set(materials);
        this.machine.set(machine);
        this.pricing.set(pricing);
        if (!this.materialId() && materials.length > 0) this.materialId.set(materials[0].id);
        if (this.quantity() < machine.minQuantity) this.quantity.set(machine.minQuantity);
        this.error.set(null);
      } catch {
        this.error.set('We could not load the material catalogue. Refresh to try again.');
        // Allow a later retry rather than caching the failure forever.
        this.referenceData = null;
      } finally {
        this.loading.set(false);
      }
    })();
    return this.referenceData;
  }

  /**
   * Restores a draft from sessionStorage — re-fetching the drawing and its bend
   * lines from the server so a deep link to /quotes/new/bends works on a cold
   * load. Resolves false when there is nothing to restore.
   */
  async restore(): Promise<boolean> {
    await this.loadReferenceData();
    if (this.drawing()) return true;

    const saved = readJson<PersistedDraft>(DRAFT_KEY, isPersistedDraft, 'session');
    if (!saved) return false;

    if (this.materials().some((m) => m.id === saved.materialId)) {
      this.materialId.set(saved.materialId);
    }
    if (saved.quantity > 0) this.quantity.set(saved.quantity);

    try {
      const [drawing, bends] = await Promise.all([
        firstValueFrom(this.drawingsApi.get(saved.drawingId)),
        firstValueFrom(this.drawingsApi.listBends(saved.drawingId)),
      ]);
      this.drawing.set(drawing);
      this.bends.set(bends);
      return true;
    } catch {
      // The drawing is gone (deleted, or another account's) — clear the stale
      // draft so the wizard sends the customer back to the upload step.
      removeSession(DRAFT_KEY);
      return false;
    }
  }

  /** Adopts a freshly uploaded drawing as the current draft. */
  setDrawing(drawing: Drawing): void {
    this.drawing.set(drawing);
    this.bends.set([]);
    this.stale.set(true);
    this.persist();
  }

  async reloadBends(): Promise<void> {
    const dwg = this.drawing();
    if (!dwg) return;
    this.bends.set(await firstValueFrom(this.drawingsApi.listBends(dwg.id)));
  }

  persist(): void {
    const dwg = this.drawing();
    if (!dwg) {
      removeSession(DRAFT_KEY);
      return;
    }
    writeJson(DRAFT_KEY, { drawingId: dwg.id, materialId: this.materialId(), quantity: this.quantity() }, 'session');
  }

  setMaterial(id: string): void {
    this.materialId.set(id);
    this.stale.set(true);
    this.persist();
  }

  setQuantity(qty: number): void {
    this.quantity.set(qty);
    this.stale.set(true);
    this.persist();
  }

  // Bend mutations are persisted server-side by the bends step; these keep the
  // local signal in step so the canvas and price preview update immediately.
  addBend(bend: BendLine): void {
    this.bends.update((list) => [...list, bend]);
    this.stale.set(true);
  }

  updateBend(id: string, patch: Partial<BendLine>): void {
    this.bends.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    this.stale.set(true);
  }

  removeBend(id: string): void {
    this.bends.update((list) => list.filter((b) => b.id !== id));
    this.stale.set(true);
  }

  reset(): void {
    this.drawing.set(null);
    this.bends.set([]);
    this.stale.set(false);
    removeSession(DRAFT_KEY);
  }
}
