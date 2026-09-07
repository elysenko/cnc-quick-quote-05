export interface ShippingAddressDto {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  confirmationNumber: string;
  quoteId: string;
  customerEmail: string;
  materialName: string;
  quantity: number;
  shippingMethodName: string;
  shippingCostCents: number;
  shippingAddress: ShippingAddressDto;
  subtotalCents: number;
  totalCents: number;
  status: 'paid' | 'in_production' | 'shipped' | 'cancelled';
  estimatedDelivery: string;
  emailSentAt: string | null;
  createdAt: string;
  /** Time-limited receipt link; null when object storage is unconfigured. */
  receiptUrl?: string | null;
}

export interface OrderListResponse {
  items: OrderDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  revenueCents?: number;
}

export const EMPTY_ADDRESS: ShippingAddressDto = {
  name: '',
  line1: '',
  city: '',
  region: '',
  postcode: '',
  country: '',
};
