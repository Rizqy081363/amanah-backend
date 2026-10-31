import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DriverMetadata,
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

const JsonUserRecordSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Format email tidak valid'),
  phone: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        return /^[+]?[\d\s-]+$/.test(val);
      },
      {
        message: 'Nomor telepon hanya boleh berisi angka dan karakter telepon',
      },
    ),
  status: z
    .enum(['active', 'inactive', 'pending_verification', 'suspended'])
    .default('active'),
  roles: z.array(z.string()).default([]),
  avatarUrl: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const JsonBackupEnvelopeSchema = z.object({
  version: z.number().int().min(1),
  exportedAt: z.string(),
  exportedBy: z.string().optional(),
  totalRecords: z.number().int().nonnegative(),
  users: z.array(JsonUserRecordSchema),
});

@Injectable()
export class JsonUserBackupDriver implements UserBackupDriver {
  readonly format = 'json';
  readonly displayName = 'JSON (Terstruktur Kanonikal)';
  readonly extension = '.json';
  readonly mimeType = 'application/json';
  readonly supportsRestore = true;
  readonly description =
    'Cadangan terstruktur kanonikal lengkap dengan metadata relasi peran dan audit (tanpa kredensial rahasia).';

  async export(
    users: UserDirectoryEntity[],
    context: ExportDriverContext,
  ): Promise<string> {
    const backupEnvelope = {
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: context.exportedBy,
      clinicLocale: context.clinicLocale,
      totalRecords: users.length,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone ?? null,
        status: u.status,
        roles: u.roles.map((r) => r.code),
        primaryAudience: u.primaryAudience,
        emailVerified: u.emailVerified,
        phoneVerified: u.phoneVerified,
        twoFactorEnabled: u.twoFactorEnabled,
        lastLoginAt: u.lastLoginAt ?? null,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
    };

    return JSON.stringify(backupEnvelope, null, 2);
  }

  async validate(
    rawContent: string,
    existingEmails: Set<string>,
    activeRolesByCode: Map<string, string>,
  ): Promise<RestoreValidationResult> {
    const errors: string[] = [];
    let parsedJson: any;

    try {
      parsedJson = JSON.parse(rawContent);
    } catch (err) {
      return {
        valid: false,
        totalRecords: 0,
        newCount: 0,
        duplicateCount: 0,
        invalidCount: 0,
        errors: ['Berkas tidak berformat JSON yang valid.'],
        preview: [],
      };
    }

    // Support both enveloped format and raw array
    let rawRecords: any[] = [];
    if (Array.isArray(parsedJson)) {
      rawRecords = parsedJson;
    } else {
      const envelopeResult = JsonBackupEnvelopeSchema.safeParse(parsedJson);
      if (!envelopeResult.success) {
        if (Array.isArray(parsedJson.users)) {
          rawRecords = parsedJson.users;
        } else {
          return {
            valid: false,
            totalRecords: 0,
            newCount: 0,
            duplicateCount: 0,
            invalidCount: 0,
            errors: envelopeResult.error.issues.map((e) => e.message),
            preview: [],
          };
        }
      } else {
        rawRecords = envelopeResult.data.users;
      }
    }

    const preview: RestorePreviewItem[] = [];
    let newCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    for (let i = 0; i < rawRecords.length; i++) {
      const raw = rawRecords[i];
      const parsedRecord = JsonUserRecordSchema.safeParse(raw);

      if (!parsedRecord.success) {
        invalidCount++;
        errors.push(
          `Baris ${i + 1} (${raw?.email || 'tanpa email'}): ${parsedRecord.error.issues.map((e) => e.message).join(', ')}`,
        );
        continue;
      }

      const rec = parsedRecord.data;
      const emailLower = rec.email.toLowerCase().trim();
      const isDuplicate = existingEmails.has(emailLower);
      const roleReasons: string[] = [];
      const validRoleCodes: string[] = [];

      for (const roleCode of rec.roles) {
        if (activeRolesByCode.has(roleCode)) {
          validRoleCodes.push(roleCode);
        } else {
          roleReasons.push(`Peran "${roleCode}" tidak terdaftar di sistem.`);
        }
      }

      if (isDuplicate) {
        duplicateCount++;
        preview.push({
          email: rec.email,
          name: rec.name,
          phone: rec.phone,
          roleCodes: validRoleCodes,
          status: rec.status,
          action: 'update',
          reasons: ['Email sudah terdaftar di sistem.', ...roleReasons],
        });
      } else {
        newCount++;
        preview.push({
          email: rec.email,
          name: rec.name,
          phone: rec.phone,
          roleCodes: validRoleCodes,
          status: rec.status,
          action: 'create',
          reasons: roleReasons,
        });
      }
    }

    return {
      valid: invalidCount === 0 && preview.length > 0,
      totalRecords: rawRecords.length,
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
        message: 'Validasi berkas restore JSON gagal.',
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
      message: `Pemulihan data pengguna berhasil: ${createdCount} akun baru dibuat, ${updatedCount} akun diperbarui, ${skippedCount} duplikat dilewati.`,
    };
  }
}
