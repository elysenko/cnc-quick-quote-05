import { Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

/**
 * Symmetric encryption for admin-entered secrets (Stripe secret key, webhook
 * secret) so they are never stored in plaintext and never returned unmasked.
 *
 * Keyed off APP_SECRET. Rotating or losing APP_SECRET makes existing ciphertext
 * undecryptable — the recovery path is re-entering the credentials in
 * Admin → Business → Payments, which is what `decryptSecret` returning null
 * causes the UI to prompt for.
 */
@Injectable()
export class SecretCryptoService {
  private readonly logger = new Logger(SecretCryptoService.name);
  private readonly key: Buffer;

  constructor() {
    const secret =
      process.env.APP_SECRET ?? process.env.JWT_SECRET ?? 'cnc-quick-quote-development-key';
    // A hash gives us a stable 32-byte key from a human-length secret.
    this.key = createHash('sha256').update(secret).digest();
  }

  /** Returns `v1:<iv>:<tag>:<ciphertext>`, all base64url. */
  encryptSecret(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join(':');
  }

  /** Null when the value is absent or was written under a different APP_SECRET. */
  decryptSecret(payload: string | null | undefined): string | null {
    if (!payload) return null;
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    try {
      const iv = Buffer.from(parts[1], 'base64url');
      const tag = Buffer.from(parts[2], 'base64url');
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(Buffer.from(parts[3], 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      this.logger.warn('Stored secret could not be decrypted — re-enter it in Admin → Settings.');
      return null;
    }
  }

  /** Shows only the last four characters: `••••••••4242`. Never echoes a secret. */
  maskSecret(value: string | null | undefined): string {
    if (!value) return '';
    const tail = value.slice(-4);
    return `${'•'.repeat(8)}${tail}`;
  }

  /** Masks the *decrypted* form of a stored ciphertext without exposing it. */
  maskStored(payload: string | null | undefined): string {
    return this.maskSecret(this.decryptSecret(payload));
  }

  /** SHA-256 hex — used for opaque refresh-token lookup. */
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
