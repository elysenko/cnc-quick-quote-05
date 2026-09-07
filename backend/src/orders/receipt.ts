import { OrderDto } from './orders.types';

interface ReceiptBranding {
  companyName: string;
  supportEmail: string;
  phone: string;
  primaryColor: string;
  addressLines: string[];
}

const money = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

const row = (label: string, value: string): string =>
  `<tr><th scope="row">${escape(label)}</th><td>${escape(value)}</td></tr>`;

/**
 * Server-rendered HTML receipt. HTML rather than PDF keeps the production image
 * free of a native rendering dependency, and it prints cleanly from a browser.
 */
export function renderReceipt(order: OrderDto, branding: ReceiptBranding): string {
  const address = order.shippingAddress;
  const addressText = [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.region, address.postcode].filter(Boolean).join(' '),
    address.country,
  ]
    .filter(Boolean)
    .join(', ');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Receipt ${escape(order.orderNumber)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#16213a; margin:0; background:#f4f6fb; }
  .sheet { max-width:640px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; }
  header { background:${escape(branding.primaryColor)}; color:#fff; padding:24px 28px; }
  header h1 { margin:0; font-size:20px; }
  header p { margin:4px 0 0; opacity:.85; font-size:14px; }
  .body { padding:28px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:left; font-weight:500; color:#5b6480; padding:9px 0; border-bottom:1px solid #eef1f7; width:45%; }
  td { text-align:right; font-weight:600; padding:9px 0; border-bottom:1px solid #eef1f7; }
  tfoot td, tfoot th { font-size:16px; border-bottom:none; padding-top:16px; }
  footer { padding:0 28px 28px; font-size:13px; color:#5b6480; }
  @media print { body { background:#fff; } .sheet { margin:0; } }
</style></head>
<body><div class="sheet">
  <header>
    <h1>${escape(branding.companyName)}</h1>
    <p>Receipt for order ${escape(order.orderNumber)}</p>
  </header>
  <div class="body">
    <table>
      <tbody>
        ${row('Order number', order.orderNumber)}
        ${row('Confirmation code', order.confirmationNumber)}
        ${row('Date', new Date(order.createdAt).toDateString())}
        ${row('Customer', order.customerEmail)}
        ${row('Material', `${order.materialName} × ${order.quantity}`)}
        ${row('Delivery address', addressText || 'Not provided')}
        ${row('Shipping', `${order.shippingMethodName} — ${money(order.shippingCostCents)}`)}
        ${row('Estimated delivery', new Date(order.estimatedDelivery).toDateString())}
        ${row('Parts subtotal', money(order.subtotalCents))}
      </tbody>
      <tfoot>
        <tr><th scope="row">Total paid</th><td>${money(order.totalCents)}</td></tr>
      </tfoot>
    </table>
  </div>
  <footer>
    ${branding.addressLines.map((line) => escape(line)).join('<br>')}
    ${branding.supportEmail || branding.phone ? '<br>' : ''}
    ${escape([branding.supportEmail, branding.phone].filter(Boolean).join(' · '))}
  </footer>
</div></body></html>`;
}
