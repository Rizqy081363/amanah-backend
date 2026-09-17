import { HttpException, HttpStatus } from '@nestjs/common';
import { OCC_ERROR_CODES } from './occ.constants';

export class PreconditionFailedException extends HttpException {
  constructor(
    public readonly currentVersion?: string,
    public readonly expectedVersion?: string,
    message = 'Precondition failed: The resource has been modified since it was retrieved.',
  ) {
    super(
      {
        code: OCC_ERROR_CODES.PRECONDITION_FAILED,
        message,
        currentVersion,
        expectedVersion,
      },
      HttpStatus.PRECONDITION_FAILED,
    );
  }
}

export class ConcurrentModificationConflictException extends HttpException {
  constructor(
    public readonly currentVersion?: string,
    message = 'Concurrent modification detected: Another transaction modified this resource concurrently.',
  ) {
    super(
      {
        code: OCC_ERROR_CODES.CONCURRENT_MODIFICATION_CONFLICT,
        message,
        currentVersion,
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class PreconditionRequiredException extends HttpException {
  constructor(
    message = 'Precondition required: This operation requires an If-Match header.',
  ) {
    super(
      {
        code: OCC_ERROR_CODES.PRECONDITION_REQUIRED,
        message,
      },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }
}
