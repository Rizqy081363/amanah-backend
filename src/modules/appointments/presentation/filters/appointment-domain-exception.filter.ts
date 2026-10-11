import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AppointmentDomainError,
  AppointmentNotCallableError,
  AppointmentNotFoundError,
  DailyQuotaExceededError,
  InvalidStatusTransitionError,
  PatientActiveTicketConflictError,
  SchedulePolicyNotFoundError,
  StaleStatusError,
} from '../../domain/errors/appointment-domain.errors';

@Catch(AppointmentDomainError)
export class AppointmentDomainExceptionFilter implements ExceptionFilter {
  catch(exception: AppointmentDomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.BAD_REQUEST;
    let errorName = 'Bad Request';

    if (
      exception instanceof StaleStatusError ||
      exception instanceof PatientActiveTicketConflictError
    ) {
      status = HttpStatus.CONFLICT;
      errorName = 'Conflict';
    } else if (exception instanceof InvalidStatusTransitionError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      errorName = 'Unprocessable Entity';
    } else if (exception instanceof AppointmentNotFoundError) {
      status = HttpStatus.NOT_FOUND;
      errorName = 'Not Found';
    } else if (
      exception instanceof AppointmentNotCallableError ||
      exception instanceof DailyQuotaExceededError ||
      exception instanceof SchedulePolicyNotFoundError
    ) {
      status = HttpStatus.BAD_REQUEST;
      errorName = 'Bad Request';
    }

    response.status(status).json({
      statusCode: status,
      error: errorName,
      code: exception.code,
      message: exception.message,
      details: exception.details,
      timestamp: new Date().toISOString(),
    });
  }
}
