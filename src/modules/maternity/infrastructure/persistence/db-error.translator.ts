import {
  MaternityDuplicateNikError,
  MaternityPatientNotFoundError,
} from '../../domain/errors/maternity.errors';

export function translateDatabaseError(error: unknown): never {
  if (!error || typeof error !== 'object') {
    throw error;
  }

  const err = error as {
    code?: string;
    constraint?: string;
    message?: string;
    cause?: { code?: string; constraint?: string };
  };

  const code = err.code || err.cause?.code;
  const constraint = err.constraint || err.cause?.constraint;

  if (
    code === '23505' &&
    constraint &&
    constraint.includes('patient_profiles_national_id_hash')
  ) {
    throw new MaternityDuplicateNikError();
  }

  if (code === '23503' && constraint && constraint.includes('patient_id')) {
    throw new MaternityPatientNotFoundError('specified');
  }

  throw error;
}
