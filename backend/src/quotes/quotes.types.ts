import { NestResult } from '../nesting/nesting.service';
import { PriceBreakdown, PricingSnapshot } from '../pricing/pricing.service';
import { MaterialDto } from '../materials/materials.service';
import { DrawingDto } from '../drawings/drawings.service';

/** Row shape used by the quotes list. */
export interface QuoteSummaryDto {
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
  status: 'draft' | 'ordered' | 'expired';
  createdAt: string;
}

/** Full quote, including everything needed to re-render the result screen. */
export interface QuoteDetailDto extends QuoteSummaryDto {
  drawing: DrawingDto;
  material: MaterialDto;
  nesting: NestResult;
  breakdown: PriceBreakdown;
  /** The pricing config frozen at quote time — never restated by later edits. */
  pricingSnapshot: PricingSnapshot & { materialMultiplier: number };
}

export interface QuoteListResponse {
  items: QuoteSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
