import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/** MySQL's duplicate-key error, which is a client mistake and not a server fault. */
function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as { code?: string; errno?: number };
  return driverError?.code === 'ER_DUP_ENTRY' || driverError?.errno === 1062;
}

/**
 * Normalises every error to the body shape the client's fetch wrapper expects:
 *
 *   { "message": string, ... }
 *
 * `client/src/api/client.ts` reads `body.message` and surfaces it directly, so
 * the key must always be present — including on 500s, where Nest would
 * otherwise emit nothing useful for raw throws.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const uniqueViolation = isUniqueViolation(exception);

    const status = uniqueViolation
      ? HttpStatus.CONFLICT
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: Record<string, unknown> = {
      message: uniqueViolation
        ? 'A record with these unique values already exists'
        : 'Internal server error',
      statusCode: status,
      path: request.url,
    };

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        body.message = payload;
      } else if (payload && typeof payload === 'object') {
        // ValidationPipe returns `message: string[]` — flatten it so the client
        // can show it without special-casing arrays.
        const { message, ...rest } = payload as Record<string, unknown>;
        Object.assign(body, rest);
        body.message = Array.isArray(message)
          ? message.join('; ')
          : (message ?? exception.message);
      }
    } else if (!uniqueViolation) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }
}
