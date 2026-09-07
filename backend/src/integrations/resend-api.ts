import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { AppConfigService } from '../config/app-config.service';
import { ServiceUnconfiguredError } from '../common/errors';

export const RESEND_CREDENTIAL_KEY = 'RESEND_API_RESEND_2_43_API_KEY';

export interface OrderConfirmationEmail {
  to: string;
  orderNumber: string;
  confirmationNumber: string;
  totalCents: number;
  materialName: string;
  quantity: number;
  estimatedDelivery: string;
  branding: {
    companyName: string;
    supportEmail: string;
    phone: string;
    primaryColor: string;
  };
}

const money = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Transactional order confirmation.
 *
 * Sending is best-effort by contract: every call site wraps this in try/catch
 * so a Resend outage leaves `Order.emailSentAt` null and logs for retry, but
 * never blocks order creation or the confirmation page.
 */
@Injectable()
export class ResendEmailService {
  private readonly logger = new Logger(ResendEmailService.name);

  constructor(private readonly appConfig: AppConfigService) {}

  async isConfigured(): Promise<boolean> {
    return this.appConfig.isConfigured(RESEND_CREDENTIAL_KEY);
  }

  private fromAddress(companyName: string): string {
    const configured = process.env.RESEND_FROM_EMAIL?.trim();
    if (configured) return configured;
    return `${companyName} <onboarding@resend.dev>`;
  }

  async sendOrderConfirmation(input: OrderConfirmationEmail): Promise<void> {
    const apiKey = await this.appConfig.resolveConfig(RESEND_CREDENTIAL_KEY);
    if (!apiKey) {
      throw new ServiceUnconfiguredError(
        RESEND_CREDENTIAL_KEY,
        'Email delivery is not configured, so no confirmation email was sent.',
      );
    }

    const resend = new Resend(apiKey);
    const { branding } = input;
    const result = await resend.emails.send({
      from: this.fromAddress(branding.companyName),
      to: input.to,
      subject: `${branding.companyName} — order ${input.orderNumber} confirmed`,
      html: this.renderHtml(input),
    });

    if (result.error) {
      throw new Error(result.error.message ?? 'Resend rejected the message.');
    }
    this.logger.log(`Order confirmation sent for ${input.orderNumber}.`);
  }

  /** Branding colours are injected so the email matches the shop's shell. */
  private renderHtml(input: OrderConfirmationEmail): string {
    const { branding } = input;
    const contact = [branding.supportEmail, branding.phone].filter(Boolean).join(' · ');
    return `<!doctype html>
<html><body style="margin:0;background:#f4f6fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#16213a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:${branding.primaryColor};padding:24px 28px;color:#fff">
          <div style="font-size:18px;font-weight:600">${this.escape(branding.companyName)}</div>
          <div style="opacity:.85;font-size:14px;margin-top:4px">Your order is confirmed</div>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 18px">Thank you — we have your order and it is queued for production.</p>
          <table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse">
            ${this.row('Order number', input.orderNumber)}
            ${this.row('Confirmation code', input.confirmationNumber)}
            ${this.row('Material', `${this.escape(input.materialName)} × ${input.quantity}`)}
            ${this.row('Estimated delivery', input.estimatedDelivery)}
            ${this.row('Total paid', money(input.totalCents))}
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 28px;font-size:13px;color:#5b6480">
          ${contact ? `Questions? Contact us at ${this.escape(contact)}.` : 'Questions? Reply to this email.'}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  private row(label: string, value: string): string {
    return `<tr>
      <td style="padding:8px 0;color:#5b6480;border-bottom:1px solid #eef1f7">${this.escape(label)}</td>
      <td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #eef1f7">${this.escape(value)}</td>
    </tr>`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    );
  }
}
