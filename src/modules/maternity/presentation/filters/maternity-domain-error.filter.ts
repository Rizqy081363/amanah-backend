import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { MaternityDomainError } from '../../domain/errors/maternity.errors';

@Catch(MaternityDomainError)
export class MaternityDomainErrorFilter implements ExceptionFilter {
  catch(exception: MaternityDomainError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(exception.statusCode).json({
      statusCode: exception.statusCode,
      message: exception.message,
      error: exception.name,
      code: exception.code,
    });
  }
}
