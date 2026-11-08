export class MaternityDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'MaternityDomainError';
  }
}

export class MaternityDuplicateNikError extends MaternityDomainError {
  constructor() {
    super(
      'NIK Ibu sudah terdaftar pada rekam medis pasien lain',
      'MATERNITY_DUPLICATE_NIK',
      400,
    );
    this.name = 'MaternityDuplicateNikError';
  }
}

export class MaternityNikCollisionError extends MaternityDomainError {
  constructor() {
    super(
      'NIK Suami tidak boleh sama dengan NIK Ibu',
      'MATERNITY_NIK_COLLISION',
      400,
    );
    this.name = 'MaternityNikCollisionError';
  }
}

export class MaternityInvalidDiagnosisYearError extends MaternityDomainError {
  constructor(message: string) {
    super(message, 'MATERNITY_INVALID_DIAGNOSIS_YEAR', 400);
    this.name = 'MaternityInvalidDiagnosisYearError';
  }
}

export class MaternityPatientNotFoundError extends MaternityDomainError {
  constructor(patientId: string) {
    super(
      `Profil pasien dengan ID ${patientId} tidak ditemukan`,
      'MATERNITY_PATIENT_NOT_FOUND',
      404,
    );
    this.name = 'MaternityPatientNotFoundError';
  }
}

export class MaternityIntakeNotFoundError extends MaternityDomainError {
  constructor(identifier: string) {
    super(
      `Data intake kehamilan dengan ID ${identifier} tidak ditemukan`,
      'MATERNITY_INTAKE_NOT_FOUND',
      404,
    );
    this.name = 'MaternityIntakeNotFoundError';
  }
}
