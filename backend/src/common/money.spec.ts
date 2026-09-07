import { Prisma } from '@prisma/client';
import { reference, toCents, toNumber } from './money';

describe('money helpers', () => {
  describe('toNumber', () => {
    it('unwraps a Prisma Decimal', () => {
      expect(toNumber(new Prisma.Decimal('1.8500'))).toBe(1.85);
    });

    it('passes numbers through and parses strings', () => {
      expect(toNumber(42.5)).toBe(42.5);
      expect(toNumber('62.0000')).toBe(62);
    });

    it('treats absent config as zero rather than NaN', () => {
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
    });
  });

  describe('toCents', () => {
    it('converts dollars to integer cents', () => {
      expect(toCents(12.5)).toBe(1250);
      expect(toCents(0)).toBe(0);
    });

    it('rounds binary-float artefacts to the nearest cent', () => {
      expect(toCents(0.1 + 0.2)).toBe(30);
      expect(toCents(1.15 * 3)).toBe(345);
      expect(Number.isInteger(toCents(19.999))).toBe(true);
    });
  });

  describe('reference', () => {
    it('prefixes and pads to the requested length', () => {
      expect(reference('Q')).toMatch(/^Q-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
      expect(reference('ORD', 8)).toMatch(/^ORD-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    });

    it('omits the letters that are easily misread aloud (I, L, O, U)', () => {
      const body = Array.from({ length: 200 }, () => reference('Q').slice(2)).join('');
      expect(body).not.toMatch(/[ILOU]/);
    });

    it('is not obviously repeating', () => {
      const seen = new Set(Array.from({ length: 50 }, () => reference('Q')));
      expect(seen.size).toBeGreaterThan(45);
    });
  });
});
