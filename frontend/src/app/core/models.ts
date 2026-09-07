/** Shared DTO interfaces. Mirrors the backend tRPC/REST contract. */

export type Role = 'USER' | 'MANAGER' | 'ADMIN';

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
}

export interface Polyline {
  closed: boolean;
  points: Array<[number, number]>;
}

export interface Drawing {
  id: string;
  filename: string;
  sizeBytes: number;
  polylines: Polyline[];
  bboxWMm: number;
  bboxHMm: number;
  cutLengthMm: number;
  entityCount: number;
  skippedEntities: string[];
  detectedUnits: string;
  createdAt: string;
}

export type BendDirection = 'up' | 'down';

export interface BendLine {
  id: string;
  drawingId: string;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  angleDeg: number;
  direction: BendDirection;
}

export interface Material {
  id: string;
  name: string;
  thicknessMm: number;
  sheetWMm: number;
  sheetHMm: number;
  costMultiplier: number;
  isActive: boolean;
}

export interface Placement {
  x: number;
  y: number;
}

export interface NestResult {
  cols: number;
  rows: number;
  perSheet: number;
  sheetCount: number;
  utilization: number;
  placements: Placement[];
}

export interface BreakdownLine {
  key: string;
  label: string;
  detail: string;
  amountCents: number;
}

export interface PriceBreakdown {
  lines: BreakdownLine[];
  subtotalCents: number;
  totalCents: number;
  minimumApplied: boolean;
}

export type QuoteStatus = 'draft' | 'ordered' | 'expired';

export interface Quote {
  id: string;
  reference: string;
  drawingId: string;
  drawingName: string;
  materialId: string;
  materialName: string;
  quantity: number;
  bendCount: number;
  cutLengthMm: number;
  sheetCount: number;
  utilization: number;
  totalCents: number;
  status: QuoteStatus;
  createdAt: string;
}

export type ShippingKind = 'flat' | 'per_sheet';

export interface ShippingMethod {
  id: string;
  name: string;
  kind: ShippingKind;
  rate: number;
  estDays: number;
  isActive: boolean;
  resolvedCostCents?: number;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
}

export type OrderStatus = 'paid' | 'in_production' | 'shipped' | 'cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  confirmationNumber: string;
  quoteId: string;
  customerEmail: string;
  materialName: string;
  quantity: number;
  shippingMethodName: string;
  shippingCostCents: number;
  shippingAddress: ShippingAddress;
  subtotalCents: number;
  totalCents: number;
  status: OrderStatus;
  estimatedDelivery: string;
  emailSentAt: string | null;
  createdAt: string;
}

export interface PricingConfig {
  setupFee: number;
  costPerLinearFoot: number;
  perSheetCost: number;
  handlingFee: number;
  costPerBend: number;
  minimumOrder: number;
}

export interface MachineConfig {
  minQuantity: number;
  maxQuantity: number;
  maxUploadBytes: number;
  allowedExtensions: string[];
  sheetSpacingMm: number;
  sheetMarginMm: number;
  animationSpeed: number;
}

export interface BusinessConfig {
  companyName: string;
  supportEmail: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  stripeSandbox: boolean;
  stripePublishableKey: string;
  stripeSecretKeyMasked: string;
  stripeWebhookSecretMasked: string;
}

export type SettingKind = 'service' | 'integration';

export interface SettingEntry {
  key: string;
  label: string;
  kind: SettingKind;
  description: string;
  maskedValue: string;
  configured: boolean;
}

export interface AppError {
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

/** Formats integer cents as a currency string. */
export function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
