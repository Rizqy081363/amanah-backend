import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  AppointmentDomainError,
  AppointmentMissingDoctorError,
  AppointmentMissingRoomError,
  AppointmentNotCallableError,
  AppointmentNotCheckedInError,
  AppointmentNotFoundError,
  AppointmentQueueTurnNotReachedError,
  CheckInAlreadyUsedError,
  CheckInExpiredError,
  CheckInForbiddenError,
  CheckInNotTodayError,
  CheckInWindowExpiredError,
  CheckInWindowTooEarlyError,
  DailyQuotaExceededError,
  DoctorAlreadyServingError,
  InvalidCheckInCodeError,
  InvalidCheckInQrError,
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
    } else if (exception instanceof CheckInForbiddenError) {
      status = HttpStatus.FORBIDDEN;
      errorName = 'Forbidden';
    } else if (
      exception instanceof AppointmentMissingDoctorError ||
      exception instanceof AppointmentMissingRoomError ||
      exception instanceof AppointmentNotCheckedInError ||
      exception instanceof AppointmentNotCallableError ||
      exception instanceof DoctorAlreadyServingError ||
      exception instanceof AppointmentQueueTurnNotReachedError ||
      exception instanceof DailyQuotaExceededError ||
      exception instanceof SchedulePolicyNotFoundError ||
      exception instanceof InvalidCheckInQrError ||
      exception instanceof InvalidCheckInCodeError ||
      exception instanceof CheckInAlreadyUsedError ||
      exception instanceof CheckInExpiredError ||
      exception instanceof CheckInWindowTooEarlyError ||
      exception instanceof CheckInWindowExpiredError ||
      exception instanceof CheckInNotTodayError
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
