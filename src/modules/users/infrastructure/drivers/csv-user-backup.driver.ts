import { Injectable } from '@nestjs/common';
import {
  ExportDriverContext,
  RestoreExecutionContext,
  RestoreExecutionResult,
  RestorePreviewItem,
  RestoreValidationResult,
  UserBackupDriver,
} from '../../domain/drivers/user-backup-driver.interface';
import { UserDirectoryEntity } from '../../domain/entities/user-directory.entity';
import { IUserManagementRepository } from '../../domain/repositories/user-management.repository.interface';
import { USER_STATUS, UserStatus } from '../../../../common/constants';

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Protect against CSV formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseCsvLines(csvText: string): string[][] {
  const lines: string[][] = [];
  const clean = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let currentField = '';
  let currentLine: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentLine.push(currentField.trim());
        if (currentLine.some((f) => f.length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some((f) => f.length > 0)) {
      lines.push(currentLine);
    }
  }

  return lines;
}

@Injectable()
export class CsvUserBackupDriver implements UserBackupDriver {
  readonly format = 'csv';
  readonly displayName = 'CSV (Tabel Portabel)';
  readonly extension = '.csv';
  readonly mimeType = 'text/csv';
  readonly supportsRestore = true;
  readonly description =
    'Format CSV standar RFC-4180 portabel untuk spreadsheet dan integrasi eksternal.';

  async export(
    users: UserDirectoryEntity[],
    _context: ExportDriverContext,
  ): Promise<string> {
    const headers = [
      'id',
      'name',
      'email',
      'phone',
      'status',
      'roles',
      'primary_audience',
      'email_verified',
      'created_at',
      'last_login_at',
    ];

    const rows: string[] = [headers.join(',')];

    for (const u of users) {
      const row = [
        escapeCsvField(u.id),
        escapeCsvField(u.name),
        escapeCsvField(u.email),
        escapeCsvField(u.phone),
        escapeCsvField(u.status),
        escapeCsvField(u.roles.map((r) => r.code).join(';')),
        escapeCsvField(u.primaryAudience),
        escapeCsvField(u.emailVerified ? 'true' : 'false'),
        escapeCsvField(u.createdAt),
        escapeCsvField(u.lastLoginAt),
      ];
      rows.push(row.join(','));
    }

    return rows.join('\r\n');
  }

  async validate(
    rawContent: string,
    existingEmails: Set<string>,
    activeRolesByCode: Map<string, string>,
  ): Promise<RestoreValidationResult> {
    const rows = parseCsvLines(rawContent);
    if (rows.length < 2) {
      return {
        valid: false,
        totalRecords: 0,
        newCount: 0,
        duplicateCount: 0,
        invalidCount: 0,
        errors: ['Berkas CSV kosong atau tidak memiliki baris data.'],
        preview: [],
      };
    }

    const headerRow = rows[0].map((h) => h.toLowerCase().trim());
    const emailIdx = headerRow.findIndex((h) => h === 'email');
    const nameIdx = headerRow.findIndex((h) => h === 'name' || h === 'nama');
    const phoneIdx = headerRow.findIndex(
      (h) => h === 'phone' || h === 'telepon',
    );
    const rolesIdx = headerRow.findIndex((h) => h === 'roles' || h === 'peran');
    const statusIdx = headerRow.findIndex((h) => h === 'status');

    if (emailIdx === -1 || nameIdx === -1) {
      return {
        valid: false,
        totalRecords: 0,
        newCount: 0,
        duplicateCount: 0,
        invalidCount: 0,
        errors: [
          'Header CSV harus menyertakan kolom wajib "email" dan "name".',
        ],
        preview: [],
      };
    }

    const preview: RestorePreviewItem[] = [];
    const errors: string[] = [];
    let newCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i];
      const email = (cols[emailIdx] || '').trim();
      const name = (cols[nameIdx] || '').trim();
      const phone = phoneIdx !== -1 ? cols[phoneIdx]?.trim() : null;
      const rawRoles = rolesIdx !== -1 ? cols[rolesIdx]?.trim() : '';
      const rawStatus = statusIdx !== -1 ? cols[statusIdx]?.trim() : 'active';

      if (!email || !email.includes('@')) {
        invalidCount++;
        errors.push(`Baris ${i + 1}: Email tidak valid ("${email}").`);
        continue;
      }

      if (!name) {
        invalidCount++;
        errors.push(`Baris ${i + 1}: Nama tidak boleh kosong.`);
        continue;
      }

      const emailLower = email.toLowerCase();
      const isDuplicate = existingEmails.has(emailLower);
      const roleCodes = rawRoles
        ? rawRoles
            .split(/[;,|]/)
            .map((r) => r.trim())
            .filter(Boolean)
        : [];

      const validRoleCodes: string[] = [];
      const roleReasons: string[] = [];

      for (const rc of roleCodes) {
        if (activeRolesByCode.has(rc)) {
          validRoleCodes.push(rc);
        } else {
          roleReasons.push(`Peran "${rc}" tidak ditemukan di sistem.`);
        }
      }

      if (isDuplicate) {
        duplicateCount++;
        preview.push({
          email,
          name,
          phone,
          roleCodes: validRoleCodes,
          status: rawStatus,
          action: 'update',
          reasons: ['Email sudah terdaftar.', ...roleReasons],
        });
      } else {
        newCount++;
        preview.push({
          email,
          name,
          phone,
          roleCodes: validRoleCodes,
          status: rawStatus,
          action: 'create',
          reasons: roleReasons,
        });
      }
    }

    return {
      valid: invalidCount === 0 && preview.length > 0,
      totalRecords: rows.length - 1,
      newCount,
      duplicateCount,
      invalidCount,
      errors,
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

    if (!validation.valid && validation.errors.length > 0) {
      return {
        success: false,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: validation.invalidCount,
        errors: validation.errors,
        message: 'Validasi CSV gagal.',
      };
    }

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

    let skippedCount = 0;

    for (const item of validation.preview) {
      if (item.action === 'create') {
        const roleIds: string[] = [];
        for (const code of item.roleCodes) {
          const roleId = activeRolesByCode.get(code);
          if (roleId) roleIds.push(roleId);
        }

        toCreate.push({
          name: item.name,
          email: item.email,
          phone: item.phone,
          roleIds,
          status: (item.status as UserStatus) || USER_STATUS.ACTIVE,
        });
      } else if (item.action === 'update') {
        if (context.duplicateStrategy === 'update') {
          toUpdate.push({
            email: item.email,
            name: item.name,
            phone: item.phone,
          });
        } else {
          skippedCount++;
        }
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
      skippedCount,
      failedCount: validation.invalidCount,
      errors: validation.errors,
      message: `Pemulihan data CSV berhasil: ${createdCount} akun baru dibuat, ${updatedCount} akun diperbarui, ${skippedCount} akun dilewati.`,
    };
  }
}
