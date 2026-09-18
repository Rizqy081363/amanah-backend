import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

export interface InvalidParam {
  name: string;
  reason: string;
  code?: string;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  statusCode: number; // Backward-compatibility alias
  detail: string;
  message: string; // Backward-compatibility alias
  instance: string;
  code: string;
  invalidParams?: InvalidParam[];
  currentVersion?: string;
  expectedVersion?: string;
  retryAfter?: number;
  traceId: string;
  timestamp: string;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();

    const traceId =
      request.correlationId ||
      (typeof request.headers[CORRELATION_ID_HEADER] === 'string'
        ? (request.headers[CORRELATION_ID_HEADER] as string)
        : randomUUID());

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail = 'An internal server error occurred.';
    let code = 'INTERNAL_SERVER_ERROR';
    let invalidParams: InvalidParam[] | undefined;
    const extraFields: Record<string, any> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = this.getStatusTitle(status);
      const res = exception.getResponse();

      if (typeof res === 'string') {
        detail = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;

        if (typeof resObj.detail === 'string') {
          detail = resObj.detail;
        } else if (typeof resObj.message === 'string') {
          detail = resObj.message;
        } else if (Array.isArray(resObj.message)) {
          detail = 'Validation failed for one or more fields.';
          invalidParams = resObj.message.map((msg: string) => ({
            name: 'payload',
            reason: msg,
            code: 'INVALID_FIELD',
          }));
        }

        if (typeof resObj.code === 'string') {
          code = resObj.code;
        } else if (typeof resObj.error === 'string') {
          code = this.normalizeErrorCode(resObj.error, status);
        } else {
          code = this.getDefaultErrorCode(status);
        }

        // Handle class-validator errors from validationOptions
        if (resObj.errors && typeof resObj.errors === 'object') {
          invalidParams = this.extractValidationErrors(resObj.errors);
          detail = 'Form validation failed for one or more fields.';
          code = 'VALIDATION_FAILED';
        }

        if (typeof resObj.currentVersion === 'string') {
          extraFields.currentVersion = resObj.currentVersion;
        }
        if (typeof resObj.expectedVersion === 'string') {
          extraFields.expectedVersion = resObj.expectedVersion;
        }
        if (typeof resObj.retryAfter === 'number') {
          extraFields.retryAfter = resObj.retryAfter;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `[${traceId}] Unhandled Exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `[${traceId}] Unknown Exception thrown: ${String(exception)}`,
      );
    }

    const problem: ProblemDetails = {
      type: `https://amanah.health/errors/${code.toLowerCase()}`,
      title,
      status,
      statusCode: status,
      detail,
      message: detail,
      instance: request.originalUrl || request.url,
      code,
      traceId,
      timestamp: new Date().toISOString(),
      ...(invalidParams && invalidParams.length > 0 ? { invalidParams } : {}),
      ...extraFields,
    };

    response.setHeader('Content-Type', 'application/problem+json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(CORRELATION_ID_HEADER, traceId);
    if (status >= 400 && status < 500) {
      this.logger.warn(
        `[${traceId}] ${request.method} ${request.originalUrl || request.url} -> ${status} ${code}: ${detail}`,
      );
    }

    response.status(status).json(problem);
  }

  private getStatusTitle(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.PRECONDITION_FAILED:
        return 'Precondition Failed';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable Entity';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too Many Requests';
      default:
        return status >= 500 ? 'Internal Server Error' : 'Client Error';
    }
  }

  private getDefaultErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.PRECONDITION_FAILED:
        return 'PRECONDITION_FAILED';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'VALIDATION_FAILED';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      default:
        return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'UNKNOWN_ERROR';
    }
  }

  private normalizeErrorCode(error: string, status: number): string {
    const candidate = error
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
    return candidate.length > 0 ? candidate : this.getDefaultErrorCode(status);
  }

  private extractValidationErrors(
    errorsObj: Record<string, any>,
    prefix = '',
  ): InvalidParam[] {
    const result: InvalidParam[] = [];

    for (const [key, value] of Object.entries(errorsObj)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        result.push({
          name: fieldPath,
          reason: value,
          code: 'INVALID_VALUE',
        });
      } else if (typeof value === 'object' && value !== null) {
        result.push(...this.extractValidationErrors(value, fieldPath));
      }
    }

    return result;
  }
}
