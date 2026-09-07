/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin under `/<mockup_id>/` and Web Storage is
 * origin-scoped (not path-scoped), so unprefixed keys collide across mockups.
 * Every read/write in the app MUST go through these helpers — never touch a
 * bare `token` / `user` / `isAuthenticated` key.
 */

const NS = (typeof location !== 'undefined' && location.pathname.split('/')[1]) || 'app';

export const nsKey = (key: string): string => `${NS}:${key}`;

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(nsKey(key), value);
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}

export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(nsKey(key));
  } catch {
    /* non-fatal */
  }
}

export function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(nsKey(key), value);
  } catch {
    /* non-fatal */
  }
}

export function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(nsKey(key));
  } catch {
    /* non-fatal */
  }
}

/**
 * Reads and JSON-parses a namespaced value, validating the parsed shape.
 * Anything unrecognised is cleared and `null` returned — restoring state must
 * never throw and never blank the page.
 */
export function readJson<T>(key: string, isValid: (v: unknown) => v is T, scope: 'local' | 'session' = 'local'): T | null {
  const raw = scope === 'local' ? readLocal(key) : readSession(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValid(parsed)) return parsed;
  } catch {
    /* fall through to clear */
  }
  if (scope === 'local') removeLocal(key);
  else removeSession(key);
  return null;
}

export function writeJson(key: string, value: unknown, scope: 'local' | 'session' = 'local'): void {
  let raw: string;
  try {
    raw = JSON.stringify(value);
  } catch {
    return;
  }
  if (scope === 'local') writeLocal(key, raw);
  else writeSession(key, raw);
}
