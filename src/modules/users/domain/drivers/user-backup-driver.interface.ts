import { UserDirectoryEntity } from '../entities/user-directory.entity';

export interface DriverMetadata {
  format: string;
  displayName: string;
  extension: string;
  mimeType: string;
  supportsRestore: boolean;
  description: string;
}

export interface ExportDriverContext {
  clinicLocale: string;
  timeZone: string;
  dateFormatStyle: string;
  exportedBy: string;
}

export interface RestorePreviewItem {
  email: string;
  name: string;
  phone?: string | null;
  roleCodes: string[];
  status: string;
  action: 'create' | 'update' | 'skip';
  reasons: string[];
}

export interface RestoreValidationResult {
  valid: boolean;
  totalRecords: number;
  newCount: number;
  duplicateCount: number;
  invalidCount: number;
  errors: string[];
  preview: RestorePreviewItem[];
  metadata?: Record<string, any>;
}

export interface RestoreExecutionContext {
  actorUserId: string;
  duplicateStrategy: 'skip' | 'update';
}

export interface RestoreExecutionResult {
  success: boolean;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
  message: string;
}

export interface UserBackupDriver {
  readonly format: string;
  readonly displayName: string;
  readonly extension: string;
  readonly mimeType: string;
  readonly supportsRestore: boolean;
  readonly description: string;

  export(
    users: UserDirectoryEntity[],
    context: ExportDriverContext,
  ): Promise<string | Buffer>;

  validate(
    rawContent: string,
    existingEmails: Set<string>,
    activeRolesByCode: Map<string, string>,
  ): Promise<RestoreValidationResult>;

  restore(
    rawContent: string,
    context: RestoreExecutionContext,
    repository: any,
  ): Promise<RestoreExecutionResult>;
}
