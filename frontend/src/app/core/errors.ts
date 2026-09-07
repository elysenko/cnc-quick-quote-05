import { HttpErrorResponse } from '@angular/common/http';
import { AppError } from './models';

interface ServerErrorBody {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  fieldErrors?: Record<string, string>;
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Normalises anything thrown by an HTTP call into one shape the UI can render.
 *
 * The backend's exception filter already emits { statusCode, code, message,
 * fieldErrors }; this also copes with a network failure (status 0) and with a
 * non-JSON response from an intermediary such as nginx.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return {
        status: 0,
        code: 'NETWORK',
        message: 'We could not reach the server. Check your connection and try again.',
      };
    }

    const body = (error.error ?? {}) as ServerErrorBody;
    const rawMessage = Array.isArray(body.message) ? body.message[0] : body.message;

    return {
      status: error.status,
      code: body.code ?? defaultCode(error.status),
      message: rawMessage || defaultMessage(error.status),
      ...(body.fieldErrors ? { fieldErrors: body.fieldErrors } : {}),
    };
  }

  if (error instanceof Error) {
    return { status: 0, code: 'UNKNOWN', message: error.message || FALLBACK_MESSAGE };
  }

  return { status: 0, code: 'UNKNOWN', message: FALLBACK_MESSAGE };
}

function defaultCode(status: number): string {
  const map: Record<number, string> = {
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_FAILED',
    429: 'RATE_LIMITED',
    502: 'UPSTREAM_UNAVAILABLE',
    503: 'SERVICE_UNCONFIGURED',
  };
  return map[status] ?? 'ERROR';
}

function defaultMessage(status: number): string {
  const map: Record<number, string> = {
    401: 'Please sign in to continue.',
    403: 'You do not have access to that.',
    404: 'We could not find that.',
    409: 'That conflicts with something that already exists.',
    429: 'Too many attempts. Wait a moment and try again.',
    502: 'A service we depend on is unavailable. Please try again.',
    503: 'That feature is not configured yet.',
  };
  return map[status] ?? FALLBACK_MESSAGE;
}
