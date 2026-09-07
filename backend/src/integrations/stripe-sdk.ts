import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { AppConfigService } from '../config/app-config.service';
import { DomainConfigService } from '../config/domain-config.service';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { ServiceUnconfiguredError } from '../common/errors';

export const STRIPE_CREDENTIAL_KEY = 'STRIPE_SDK_PYTHON_STRIPE_15_6_API_KEY';
export const STRIPE_WEBHOOK_KEY = 'STRIPE_WEBHOOK_SECRET';

/**
 * Stripe hosted Checkout.
 *
 * Key precedence: the key an administrator saved under Business → Payments
 * (encrypted at rest) wins, because that is the account whose dashboard the
 * shop owner actually watches; the platform-injected credential is the
 * fallback. Unresolved ⇒ ServiceUnconfiguredError (503), never a crash.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly domainConfig: DomainConfigService,
    private readonly crypto: SecretCryptoService,
  ) {}

  async resolveSecretKey(): Promise<string | null> {
    const business = await this.domainConfig.business();
    const fromAdmin = this.crypto.decryptSecret(business.stripeSecretKeyEnc);
    if (fromAdmin) return fromAdmin;
    return this.appConfig.resolveConfig(STRIPE_CREDENTIAL_KEY);
  }

  async resolveWebhookSecret(): Promise<string | null> {
    const business = await this.domainConfig.business();
    const fromAdmin = this.crypto.decryptSecret(business.stripeWebhookSecretEnc);
    if (fromAdmin) return fromAdmin;
    return this.appConfig.resolveConfig(STRIPE_WEBHOOK_KEY);
  }

  async isConfigured(): Promise<boolean> {
    return (await this.resolveSecretKey()) !== null;
  }

  /** Builds a client, or throws 503 when no key is available anywhere. */
  async client(explicitKey?: string): Promise<Stripe> {
    const key = explicitKey ?? (await this.resolveSecretKey());
    if (!key) {
      throw new ServiceUnconfiguredError(
        STRIPE_CREDENTIAL_KEY,
        'Card payments are not available yet because Stripe has not been configured. An administrator can add the keys under Admin → Business → Payments.',
      );
    }
    return new Stripe(key, { maxNetworkRetries: 1, timeout: 20_000 });
  }

  /**
   * Live credential check used before saving keys, so an administrator finds
   * out the key is wrong at save time rather than at a customer's checkout.
   */
  async probeCredentials(secretKey: string): Promise<{ ok: boolean; message: string }> {
    try {
      const stripe = await this.client(secretKey);
      await stripe.balance.retrieve();
      return { ok: true, message: 'Stripe credentials verified.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stripe rejected the credentials.';
      this.logger.warn(`Stripe credential probe failed: ${message}`);
      return { ok: false, message };
    }
  }

  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
  ): Promise<Stripe.Checkout.Session> {
    const stripe = await this.client();
    return stripe.checkout.sessions.create(params);
  }

  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    const stripe = await this.client();
    return stripe.checkout.sessions.retrieve(sessionId);
  }

  /** Throws when the signature does not verify — the caller answers 400. */
  constructEvent(rawBody: Buffer, signature: string, secret: string): Stripe.Event {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
}
