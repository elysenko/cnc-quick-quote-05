import { Prisma } from '@prisma/client';

/** Prisma Decimal | number | string → number. Config rates cross the wire as numbers. */
export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}

/** Dollars → integer cents. Every money value leaves the backend as integer cents. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Zero-padded, human-quotable reference, e.g. Q-7F3A21. */
export function reference(prefix: string, size = 6): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let out = '';
  for (let i = 0; i < size; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}-${out}`;
}
