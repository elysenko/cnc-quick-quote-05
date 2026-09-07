import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Raised when an integration credential resolves to nothing (neither env nor
 * SystemSetting). Surfaces as HTTP 503 so the UI can point the admin at
 * /admin/settings rather than showing a generic crash.
 */
export class ServiceUnconfiguredError extends HttpException {
  constructor(public readonly serviceKey: string, message?: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'SERVICE_UNCONFIGURED',
        serviceKey,
        message:
          message ??
          `${serviceKey} is not configured. An administrator can add the credential under Admin → Settings.`,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/** DXF could not be read, or contains nothing this app can cut. Maps to 422. */
export class DxfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DxfParseError';
  }
}

/** The part's bounding box does not fit a single sheet of the chosen material. */
export class PartTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartTooLargeError';
  }
}
