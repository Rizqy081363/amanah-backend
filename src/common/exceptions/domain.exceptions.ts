import { HttpException, HttpStatus } from '@nestjs/common';
import type { InvalidParam } from '../filters/problem-details.filter';

/**
 * Base abstract class for all domain-level exceptions in Amanah Healthcare.
 * Extends NestJS HttpException so that ProblemDetailsFilter natively maps it
 * into RFC 7807 Problem Details without requiring custom per-module filters.
 */
export abstract class DomainException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: Record<string, unknown>,
    public readonly invalidParams?: InvalidParam[],
  ) {
    super(
      {
        code,
        message,
        detail: message,
        ...(details ? { details, ...details } : {}),
        ...(invalidParams && invalidParams.length > 0 ? { invalidParams } : {}),
      },
      status,
    );
  }
}

/**
 * Thrown when an authoritative domain entity is not found by ID or query criteria.
 * Maps to HTTP 404 Not Found.
 */
export class EntityNotFoundException extends DomainException {
  constructor(
    entityName: string,
    identifier: string | Record<string, unknown>,
  ) {
    const idString =
      typeof identifier === 'string' ? identifier : JSON.stringify(identifier);
    super(
      `${entityName.toUpperCase()}_NOT_FOUND`,
      `${entityName} dengan identitas "${idString}" tidak ditemukan.`,
      HttpStatus.NOT_FOUND,
      typeof identifier === 'string' ? { id: identifier } : identifier,
    );
  }
}

/**
 * Thrown when an invariant, duplicate state, or business concurrency conflict occurs.
 * Maps to HTTP 409 Conflict.
 */
export class DomainConflictException extends DomainException {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

/**
 * Thrown when domain or schema validation fails.
 * Maps to HTTP 400 Bad Request (RFC 7807 with invalidParams).
 */
export class DomainValidationException extends DomainException {
  constructor(
    message: string,
    invalidParams?: InvalidParam[],
    details?: Record<string, unknown>,
  ) {
    super(
      'VALIDATION_FAILED',
      message,
      HttpStatus.BAD_REQUEST,
      details,
      invalidParams,
    );
  }
}

/**
 * Thrown when an authenticated principal is not permitted to perform a domain action.
 * Maps to HTTP 403 Forbidden.
 */
export class DomainForbiddenException extends DomainException {
  constructor(
    message = 'Anda tidak memiliki hak akses untuk melakukan operasi ini.',
    code = 'FORBIDDEN',
    details?: Record<string, unknown>,
  ) {
    super(code, message, HttpStatus.FORBIDDEN, details);
  }
}

/**
 * Thrown when an unauthenticated actor attempts an operation requiring an active principal.
 * Maps to HTTP 401 Unauthorized.
 */
export class DomainUnauthorizedException extends DomainException {
  constructor(
    message = 'Sesi autentikasi tidak valid atau telah berakhir.',
    code = 'UNAUTHENTICATED',
    details?: Record<string, unknown>,
  ) {
    super(code, message, HttpStatus.UNAUTHORIZED, details);
  }
}

/**
 * Thrown when an entity lifecycle transition is invalid or forbidden from the current state.
 * Maps to HTTP 422 Unprocessable Entity.
 */
export class InvalidStateTransitionException extends DomainException {
  constructor(
    entityName: string,
    fromState: string,
    toState: string,
    details?: Record<string, unknown>,
  ) {
    super(
      'INVALID_STATUS_TRANSITION',
      `Transisi status ${entityName} dari "${fromState}" ke "${toState}" tidak diizinkan.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { entityName, fromState, toState, ...(details || {}) },
    );
  }
}
