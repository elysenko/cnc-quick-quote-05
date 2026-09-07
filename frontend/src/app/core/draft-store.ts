import { Injectable, computed, signal } from '@angular/core';
import { BendLine, Drawing, MachineConfig, Material, PricingConfig } from './models';
import { demoDrawing } from './demo-geometry';
import { nest, price } from './estimate';
import { readJson, removeSession, writeJson } from './storage';

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
 * Wizard state for `/quotes/new/*`. Persisted to sessionStorage keyed by drawing
 * id so a deep link to any step restores the draft rather than dead-ending.
 */
@Injectable({ providedIn: 'root' })
export class DraftStore {
  readonly drawing = signal<Drawing | null>(demoDrawing());

  readonly bends = signal<BendLine[]>([
    { id: 'bnd_01', drawingId: 'dwg_8f31c2', sx: 0, sy: 40, ex: 180, ey: 40, angleDeg: 90, direction: 'up' },
    { id: 'bnd_02', drawingId: 'dwg_8f31c2', sx: 0, sy: 96, ex: 180, ey: 96, angleDeg: 45, direction: 'down' },
  ]);

  readonly materials = signal<Material[]>([
    { id: 'mat_ms16', name: 'Mild Steel', thicknessMm: 1.6, sheetWMm: 2500, sheetHMm: 1250, costMultiplier: 1.0, isActive: true },
    { id: 'mat_ms30', name: 'Mild Steel', thicknessMm: 3.0, sheetWMm: 2500, sheetHMm: 1250, costMultiplier: 1.45, isActive: true },
    { id: 'mat_ss20', name: 'Stainless 304', thicknessMm: 2.0, sheetWMm: 2000, sheetHMm: 1000, costMultiplier: 2.35, isActive: true },
    { id: 'mat_al30', name: 'Aluminium 5052', thicknessMm: 3.0, sheetWMm: 2500, sheetHMm: 1250, costMultiplier: 1.85, isActive: true },
    { id: 'mat_bz15', name: 'Brass C260', thicknessMm: 1.5, sheetWMm: 1200, sheetHMm: 600, costMultiplier: 3.1, isActive: true },
  ]);

  readonly machine = signal<MachineConfig>({
    minQuantity: 1,
    maxQuantity: 500,
    maxUploadBytes: 10 * 1024 * 1024,
    allowedExtensions: ['.dxf'],
    sheetSpacingMm: 6,
    sheetMarginMm: 12,
    animationSpeed: 320,
  });

  readonly pricing = signal<PricingConfig>({
    setupFee: 45,
    costPerLinearFoot: 1.85,
    perSheetCost: 62,
    handlingFee: 12.5,
    costPerBend: 3.25,
    minimumOrder: 95,
  });

  readonly materialId = signal<string>('mat_ms16');
  readonly quantity = signal<number>(24);

  readonly material = computed(() => this.materials().find((m) => m.id === this.materialId()) ?? this.materials()[0]);

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

  constructor() {
    this.restore();
  }

  private restore(): void {
    const saved = readJson<PersistedDraft>(DRAFT_KEY, isPersistedDraft, 'session');
    if (!saved) return;
    if (this.materials().some((m) => m.id === saved.materialId)) {
      this.materialId.set(saved.materialId);
    }
    if (saved.quantity > 0) this.quantity.set(saved.quantity);
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

  /** Restores the demo drawing — used when a deep link lands mid-wizard. */
  ensureDrawing(): void {
    if (!this.drawing()) this.drawing.set(demoDrawing());
  }
}
