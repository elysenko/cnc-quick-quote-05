/**
 * Resolves the API origin.
 *
 * In production the deploy serves the SPA under a path prefix (`baseHref:
 * /{{IMAGE_NAME}}/`) with nginx proxying `/api/` to the backend, so API calls
 * must be rooted at the ORIGIN, not at the base href — a relative `api/...`
 * would resolve under the prefix and 404. In development the Angular dev-server
 * proxy (`proxy.conf.json`) forwards the same absolute path.
 */
const API_ROOT = '/api';

export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_ROOT}${suffix}`;
}

/** True for requests the auth interceptor should attach a bearer token to. */
export function isApiRequest(url: string): boolean {
  return url.startsWith(API_ROOT) || url.includes(`${API_ROOT}/`);
}
