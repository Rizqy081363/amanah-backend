import { Injectable } from '@nestjs/common';
import {
  ExportDriverContext,
  RestoreExecutionContext,
  RestoreExecutionResult,
  RestoreValidationResult,
  UserBackupDriver,
} from '../../domain/drivers/user-backup-driver.interface';
import { UserDirectoryEntity } from '../../domain/entities/user-directory.entity';
import { IUserManagementRepository } from '../../domain/repositories/user-management.repository.interface';
import { USER_STATUS, UserStatus } from '../../../../common/constants';

function sqlEscapeString(val: string | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}

@Injectable()
export class SqlUserBackupDriver implements UserBackupDriver {
  readonly format = 'sql';
  readonly displayName = 'SQL (PostgreSQL Dump)';
  readonly extension = '.sql';
  readonly mimeType = 'application/sql';
  readonly supportsRestore = true;
  readonly description =
    'Skrip SQL PostgreSQL kanonikal dengan transaksi atomik dan klausul idempotensi ON CONFLICT.';

  async export(
    users: UserDirectoryEntity[],
    context: ExportDriverContext,
  ): Promise<string> {
    const lines: string[] = [
      '--',
      `-- Amanah Healthcare System - User Accounts Data Backup (SQL Dump)`,
      `-- Exported At : ${new Date().toISOString()}`,
      `-- Exported By : ${context.exportedBy}`,
      `-- Total Users : ${users.length}`,
      '--',
      'BEGIN;',
      '',
    ];

    for (const u of users) {
      lines.push(
        `INSERT INTO users (id, name, email, phone, status, email_verified, phone_verified, two_factor_enabled, auth_version, created_at, updated_at) VALUES (` +
          `${sqlEscapeString(u.id)}, ` +
          `${sqlEscapeString(u.name)}, ` +
          `${sqlEscapeString(u.email)}, ` +
          `${sqlEscapeString(u.phone)}, ` +
          `${sqlEscapeString(u.status)}, ` +
          `${u.emailVerified ? 'true' : 'false'}, ` +
          `${u.phoneVerified ? 'true' : 'false'}, ` +
          `${u.twoFactorEnabled ? 'true' : 'false'}, ` +
          `${u.authVersion || 1}, ` +
          `${sqlEscapeString(u.createdAt)}, ` +
          `${sqlEscapeString(u.updatedAt)}` +
          `) ON CONFLICT (email) DO UPDATE SET ` +
          `name = EXCLUDED.name, phone = EXCLUDED.phone, status = EXCLUDED.status, updated_at = NOW();`,
      );

      for (const r of u.roles) {
        lines.push(
          `INSERT INTO user_roles (user_id, role_id) ` +
            `SELECT ${sqlEscapeString(u.id)}::uuid, r.id FROM roles r WHERE r.code = ${sqlEscapeString(r.code)} ` +
            `ON CONFLICT DO NOTHING;`,
        );
      }
    }

    lines.push('');
    lines.push('COMMIT;');
    return lines.join('\n');
  }

  async validate(
    rawContent: string,
    existingEmails: Set<string>,
    activeRolesByCode: Map<string, string>,
  ): Promise<RestoreValidationResult> {
    const lines = rawContent.split('\n').map((l) => l.trim());
    const errors: string[] = [];
    const forbiddenPatterns = [
      /\bdrop\b/i,
      /\btruncate\b/i,
      /\balter\b/i,
      /\bdelete\b/i,
      /\bgrant\b/i,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('--')) continue;

      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          errors.push(
            `Baris ${i + 1} terdeteksi mengandung perintah berbahaya (${pattern.source}).`,
          );
        }
      }
    }

    if (errors.length > 0) {
      return {
        valid: false,
        totalRecords: 0,
        newCount: 0,
        duplicateCount: 0,
        invalidCount: errors.length,
        errors,
        preview: [],
      };
    }

    // Extract records from INSERT INTO users statements
    const userInsertRegex =
      /INSERT\s+INTO\s+users\s*\([^)]*\)\s*VALUES\s*\(([^)]+)\)/i;
    const preview: any[] = [];
    let newCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(userInsertRegex);
      if (match) {
        const rawValues = match[1];
        const parts = rawValues
          .split(',')
          .map((s) => s.trim().replace(/^'|'$/g, ''));
        const name = parts[1] || '';
        const email = parts[2] || '';
        const phone = parts[3] === 'NULL' ? null : parts[3];
        const status = parts[4] || 'active';

        if (email && email.includes('@')) {
          const isDuplicate = existingEmails.has(email.toLowerCase());
          if (isDuplicate) {
            duplicateCount++;
            preview.push({
              email,
              name,
              phone,
              roleCodes: [],
              status,
              action: 'update',
              reasons: ['Email sudah terdaftar (akan diperbarui via ON CONFLICT).'],
            });
          } else {
            newCount++;
            preview.push({
              email,
              name,
              phone,
              roleCodes: [],
              status,
              action: 'create',
              reasons: [],
            });
          }
        }
      }
    }

    return {
      valid: preview.length > 0 && errors.length === 0,
      totalRecords: preview.length,
      newCount,
      duplicateCount,
      invalidCount: 0,
      errors: [],
      preview,
    };
  }

  async restore(
    rawContent: string,
    context: RestoreExecutionContext,
    repository: IUserManagementRepository,
  ): Promise<RestoreExecutionResult> {
    const existingEmails = await repository.getAllUserEmails();
    const activeRolesByCode = await repository.getActiveRolesMap();
    const validation = await this.validate(
      rawContent,
      existingEmails,
      activeRolesByCode,
    );

    if (!validation.valid) {
      return {
        success: false,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: validation.errors.length,
        errors: validation.errors,
        message: 'Validasi skrip SQL gagal.',
      };
    }

    // Extract users to batch create/update safely
    const toCreate: {
      name: string;
      email: string;
      phone?: string | null;
      roleIds: string[];
      status: UserStatus;
    }[] = [];

    const toUpdate: {
      email: string;
      name?: string;
      phone?: string | null;
    }[] = [];

    for (const item of validation.preview) {
      if (item.action === 'create') {
        toCreate.push({
          name: item.name,
          email: item.email,
          phone: item.phone,
          roleIds: [],
          status: (item.status as UserStatus) || USER_STATUS.ACTIVE,
        });
      } else if (item.action === 'update' && context.duplicateStrategy === 'update') {
        toUpdate.push({
          email: item.email,
          name: item.name,
          phone: item.phone,
        });
      }
    }

    let createdCount = 0;
    if (toCreate.length > 0) {
      const res = await repository.batchCreateUsers(
        toCreate,
        context.actorUserId,
      );
      createdCount = res.created;
    }

    let updatedCount = 0;
    if (toUpdate.length > 0) {
      updatedCount = await repository.batchUpdateUsers(toUpdate);
    }

    return {
      success: true,
      importedCount: createdCount,
      updatedCount,
      skippedCount: validation.duplicateCount - updatedCount,
      failedCount: 0,
      errors: [],
      message: `Restorasi SQL dump berhasil: ${createdCount} pengguna baru, ${updatedCount} pengguna diperbarui.`,
    };
  }
}
