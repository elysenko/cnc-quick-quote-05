import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Normalises every error into { statusCode, code, message, fieldErrors } so the
 * Angular `toAppError` mapper has one shape to read, and so an unexpected
 * exception never leaks a stack trace to a customer.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(this.fromHttpException(exception, status));
      return;
    }

    this.logger.error(
      `Unhandled error: ${exception instanceof Error ? exception.stack : String(exception)}`,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side. Please try again.',
    } satisfies ErrorBody);
  }

  private fromHttpException(exception: HttpException, status: number): ErrorBody {
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { statusCode: status, code: this.codeFor(status), message: payload };
    }

    const body = payload as Record<string, unknown>;
    const rawMessage = body['message'];

    // class-validator hands us an array of messages; the first is the one a
    // human should read, and the rest still travel as fieldErrors.
    if (Array.isArray(rawMessage)) {
      return {
        statusCode: status,
        code: (body['code'] as string) ?? 'VALIDATION_FAILED',
        message: String(rawMessage[0] ?? 'Please check the highlighted fields.'),
        fieldErrors: Object.fromEntries(
          rawMessage.map((m, i) => [String(i), String(m)]),
        ),
      };
    }

    return {
      statusCode: status,
      code: (body['code'] as string) ?? this.codeFor(status),
      message: String(rawMessage ?? exception.message),
      ...(body['serviceKey'] ? { fieldErrors: { serviceKey: String(body['serviceKey']) } } : {}),
    };
  }

  private codeFor(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_FAILED';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMITED';
      case HttpStatus.BAD_GATEWAY:
        return 'UPSTREAM_UNAVAILABLE';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNCONFIGURED';
      default:
        return 'ERROR';
    }
  }
}
