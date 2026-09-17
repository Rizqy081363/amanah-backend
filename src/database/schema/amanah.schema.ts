import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

export const addressType = pgEnum('address_type', [
  'domicile',
  'identity_card',
  'other',
]);
export const appointmentStatus = pgEnum('appointment_status', [
  'booked',
  'checked_in',
  'waiting',
  'in_service',
  'completed',
  'cancelled',
  'no_doctor',
  'no_show',
]);
export const attendanceMethod = pgEnum('attendance_method', [
  'qr_scan',
  'manual_pin',
  'qr_upload',
  'system',
]);
export const attendanceQrSessionType = pgEnum('attendance_qr_session_type', [
  'location_check_in',
  'staff_identity',
]);
export const attendanceStatus = pgEnum('attendance_status', [
  'present',
  'late',
  'missed',
  'leave',
  'absent',
]);
export const authVerificationPurpose = pgEnum('auth_verification_purpose', [
  'email_verification',
  'password_reset',
  'email_change',
  'magic_link',
  'otp',
  'two_factor',
]);
export const bloodType = pgEnum('blood_type', [
  'a_positive',
  'a_negative',
  'b_positive',
  'b_negative',
  'ab_positive',
  'ab_negative',
  'o_positive',
  'o_negative',
  'a',
  'b',
  'ab',
  'o',
  'unknown',
]);
export const clinicUnitType = pgEnum('clinic_unit_type', [
  'department',
  'polyclinic',
  'ward',
  'emergency',
  'support',
  'other',
]);
export const conversationParticipantRole = pgEnum(
  'conversation_participant_role',
  ['patient', 'staff', 'system'],
);
export const dataExportStatus = pgEnum('data_export_status', [
  'queued',
  'processing',
  'completed',
  'failed',
  'expired',
]);
export const dataExportType = pgEnum('data_export_type', [
  'attendance_pdf',
  'profile_data',
  'medical_record',
  'other',
]);
export const devicePlatform = pgEnum('device_platform', [
  'web',
  'android',
  'ios',
  'macos',
  'windows',
  'linux',
  'unknown',
]);
export const encounterStatus = pgEnum('encounter_status', [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
]);
export const fileAccessScope = pgEnum('file_access_scope', [
  'private_patient',
  'staff_only',
  'public',
]);
export const gender = pgEnum('gender', ['male', 'female']);
export const medicalFlowType = pgEnum('medical_flow_type', [
  'pregnancy',
  'immunization',
]);
export const messageSenderType = pgEnum('message_sender_type', [
  'user',
  'contact',
  'system',
]);
export const messageType = pgEnum('message_type', [
  'text',
  'audio',
  'status_update',
  'image',
  'file',
]);
export const notificationActionType = pgEnum('notification_action_type', [
  'primary',
  'secondary',
  'warning',
  'info',
]);
export const notificationCategory = pgEnum('notification_category', [
  'appointment',
  'promotion',
  'lab_result',
  'queue',
  'clinical',
  'shift',
  'pharmacy',
  'telemedicine',
  'support',
  'system',
]);
export const patientStatus = pgEnum('patient_status', ['active', 'inactive']);
export const queuePriority = pgEnum('queue_priority', [
  'regular',
  'priority',
  'bpjs',
  'vip',
]);
export const queueStatus = pgEnum('queue_status', [
  'waiting',
  'called',
  'in_service',
  'completed',
  'skipped',
  'cancelled',
]);
export const reviewSource = pgEnum('review_source', ['google', 'manual']);
export const scheduleStatus = pgEnum('schedule_status', [
  'pending',
  'open',
  'full',
  'leave',
  'closed',
]);
export const staffCredentialStatus = pgEnum('staff_credential_status', [
  'unverified',
  'verified',
  'expired',
  'revoked',
]);
export const staffCredentialType = pgEnum('staff_credential_type', [
  'sip',
  'str',
  'kki',
  'npwp',
  'nib',
  'national_id',
  'other',
]);
export const staffLeaveRequestStatus = pgEnum('staff_leave_request_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
export const staffLeaveRequestType = pgEnum('staff_leave_request_type', [
  'annual_leave',
  'sick_leave',
  'seminar_symposium',
  'family_matter',
  'external_assignment',
  'other',
]);
export const staffShift = pgEnum('staff_shift', [
  'early_morning',
  'morning',
  'afternoon',
  'night',
]);
export const staffStatus = pgEnum('staff_status', [
  'active',
  'inactive',
  'on_leave',
]);
export const staffType = pgEnum('staff_type', ['doctor', 'midwife', 'worker']);
export const supportTicketPriority = pgEnum('support_ticket_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);
export const supportTicketSenderType = pgEnum('support_ticket_sender_type', [
  'reporter',
  'support_agent',
  'system',
]);
export const supportTicketStatus = pgEnum('support_ticket_status', [
  'open',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
]);
export const userStatus = pgEnum('user_status', [
  'pending_verification',
  'active',
  'inactive',
  'suspended',
]);
export const visitType = pgEnum('visit_type', ['new_visit', 'follow_up']);

export const users = pgTable(
  'users',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: text().notNull(),
    email: citext('email').notNull(),
    phone: text(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    phoneVerified: boolean('phone_verified').default(false).notNull(),
    imageUrl: text('image_url'),
    status: userStatus().default('pending_verification').notNull(),
    preferredLocale: varchar('preferred_locale', { length: 16 })
      .default('id-ID')
      .notNull(),
    twoFactorEnabled: boolean('two_factor_enabled').default(false).notNull(),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('users_phone_unique')
      .using('btree', table.phone.asc().nullsLast().op('text_ops'))
      .where(sql`(phone IS NOT NULL)`),
    unique('users_email_key').on(table.email),
    check(
      'users_email_not_blank',
      sql`length(TRIM(BOTH FROM (email)::text)) > 0`,
    ),
    check('users_name_not_blank', sql`length(TRIM(BOTH FROM name)) > 0`),
    check(
      'users_phone_not_blank',
      sql`(phone IS NULL) OR (length(TRIM(BOTH FROM phone)) > 0)`,
    ),
  ],
);

export const userDevices = pgTable(
  'user_devices',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    platform: devicePlatform().default('unknown').notNull(),
    deviceIdentifierHash: text('device_identifier_hash').notNull(),
    deviceName: text('device_name'),
    appVersion: text('app_version'),
    osVersion: text('os_version'),
    pushTokenHash: text('push_token_hash'),
    pushTokenEncrypted: text('push_token_encrypted'),
    biometricEnabled: boolean('biometric_enabled').default(false).notNull(),
    trustedAt: timestamp('trusted_at', { withTimezone: true, mode: 'string' }),
    lastSeenAt: timestamp('last_seen_at', {
      withTimezone: true,
      mode: 'string',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('user_devices_push_token_hash_unique')
      .using('btree', table.pushTokenHash.asc().nullsLast().op('text_ops'))
      .where(sql`(push_token_hash IS NOT NULL)`),
    index('user_devices_user_active_idx')
      .using(
        'btree',
        table.userId.asc().nullsLast().op('uuid_ops'),
        table.platform.asc().nullsLast().op('timestamptz_ops'),
        table.lastSeenAt.desc().nullsFirst().op('timestamptz_ops'),
      )
      .where(sql`(revoked_at IS NULL)`),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_devices_user_id_fkey',
    }).onDelete('cascade'),
    unique('user_devices_unique_device').on(
      table.userId,
      table.deviceIdentifierHash,
    ),
    check(
      'user_devices_identifier_hash_not_blank',
      sql`length(TRIM(BOTH FROM device_identifier_hash)) > 0`,
    ),
    check(
      'user_devices_push_token_hash_not_blank',
      sql`(push_token_hash IS NULL) OR (length(TRIM(BOTH FROM push_token_hash)) > 0)`,
    ),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    deviceId: uuid('device_id'),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('auth_sessions_active_idx')
      .using('btree', table.expiresAt.asc().nullsLast().op('timestamptz_ops'))
      .where(sql`(revoked_at IS NULL)`),
    index('auth_sessions_user_expires_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.expiresAt.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.deviceId],
      foreignColumns: [userDevices.id],
      name: 'auth_sessions_device_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'auth_sessions_user_id_fkey',
    }).onDelete('cascade'),
    unique('auth_sessions_token_hash_key').on(table.tokenHash),
    check(
      'auth_sessions_token_hash_not_blank',
      sql`length(TRIM(BOTH FROM token_hash)) > 0`,
    ),
  ],
);

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    passwordHash: text('password_hash'),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    idTokenEncrypted: text('id_token_encrypted'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'string',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'string',
    }),
    scope: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('auth_accounts_one_credential_per_user')
      .using('btree', table.userId.asc().nullsLast().op('uuid_ops'))
      .where(sql`(provider_id = 'credential'::text)`),
    index('auth_accounts_user_idx').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'auth_accounts_user_id_fkey',
    }).onDelete('cascade'),
    unique('auth_accounts_provider_identity_unique').on(
      table.accountId,
      table.providerId,
    ),
    check(
      'auth_accounts_account_id_not_blank',
      sql`length(TRIM(BOTH FROM account_id)) > 0`,
    ),
    check(
      'auth_accounts_provider_id_not_blank',
      sql`length(TRIM(BOTH FROM provider_id)) > 0`,
    ),
  ],
);

export const authTwoFactors = pgTable(
  'auth_two_factors',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    secretEncrypted: text('secret_encrypted').notNull(),
    backupCodesEncrypted: text('backup_codes_encrypted').notNull(),
    verified: boolean().default(false).notNull(),
    failedVerificationCount: integer('failed_verification_count')
      .default(0)
      .notNull(),
    lockedUntil: timestamp('locked_until', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'auth_two_factors_user_id_fkey',
    }).onDelete('cascade'),
    unique('auth_two_factors_user_id_key').on(table.userId),
    check(
      'auth_two_factors_failed_count_nonnegative',
      sql`failed_verification_count >= 0`,
    ),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    description: text(),
    isSystem: boolean('is_system').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('roles_code_key').on(table.code),
    check('roles_code_format', sql`code ~ '^[a-z][a-z0-9_]*$'::text`),
  ],
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: text().notNull(),
    description: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('permissions_code_key').on(table.code),
    check('permissions_code_format', sql`code ~ '^[a-z][a-z0-9_:.]*$'::text`),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    roleId: uuid('role_id').notNull(),
    assignedBy: uuid('assigned_by'),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('user_roles_active_unique')
      .using(
        'btree',
        table.userId.asc().nullsLast().op('uuid_ops'),
        table.roleId.asc().nullsLast().op('uuid_ops'),
      )
      .where(sql`(revoked_at IS NULL)`),
    index('user_roles_user_idx')
      .using('btree', table.userId.asc().nullsLast().op('uuid_ops'))
      .where(sql`(revoked_at IS NULL)`),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'user_roles_assigned_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: 'user_roles_role_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_roles_user_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const clinicUnits = pgTable(
  'clinic_units',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    unitType: clinicUnitType('unit_type').default('other').notNull(),
    location: text(),
    floor: text(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('clinic_units_type_active_idx').using(
      'btree',
      table.unitType.asc().nullsLast().op('bool_ops'),
      table.isActive.asc().nullsLast().op('bool_ops'),
    ),
    unique('clinic_units_code_key').on(table.code),
    check('clinic_units_code_format', sql`code ~ '^[a-z][a-z0-9_]*$'::text`),
    check('clinic_units_name_not_blank', sql`length(TRIM(BOTH FROM name)) > 0`),
  ],
);

export const clinicRooms = pgTable(
  'clinic_rooms',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    unitId: uuid('unit_id'),
    code: text().notNull(),
    name: text().notNull(),
    location: text(),
    floor: text(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('clinic_rooms_unit_idx').using(
      'btree',
      table.unitId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [clinicUnits.id],
      name: 'clinic_rooms_unit_id_fkey',
    }).onDelete('set null'),
    unique('clinic_rooms_code_key').on(table.code),
  ],
);

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    description: text(),
    displayOrder: integer('display_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('service_categories_code_key').on(table.code),
    check(
      'service_categories_code_format',
      sql`code ~ '^[a-z][a-z0-9_]*$'::text`,
    ),
  ],
);

export const clinicServices = pgTable(
  'clinic_services',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    serviceCategoryId: uuid('service_category_id'),
    specialtyId: uuid('specialty_id'),
    code: text().notNull(),
    name: text().notNull(),
    shortName: text('short_name'),
    description: text(),
    codePrefix: varchar('code_prefix', { length: 8 }).notNull(),
    medicalFlow: medicalFlowType('medical_flow'),
    iconName: text('icon_name'),
    imageUrl: text('image_url'),
    displayOrder: integer('display_order').default(0).notNull(),
    isBookable: boolean('is_bookable').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('clinic_services_category_idx').using(
      'btree',
      table.serviceCategoryId.asc().nullsLast().op('uuid_ops'),
    ),
    index('clinic_services_name_trgm_idx').using(
      'gin',
      table.name.asc().nullsLast().op('gin_trgm_ops'),
    ),
    foreignKey({
      columns: [table.serviceCategoryId],
      foreignColumns: [serviceCategories.id],
      name: 'clinic_services_service_category_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.specialtyId],
      foreignColumns: [medicalSpecialties.id],
      name: 'clinic_services_specialty_id_fkey',
    }).onDelete('set null'),
    unique('clinic_services_code_key').on(table.code),
    check('clinic_services_code_format', sql`code ~ '^[a-z][a-z0-9_]*$'::text`),
    check(
      'clinic_services_code_prefix_not_blank',
      sql`length(TRIM(BOTH FROM code_prefix)) > 0`,
    ),
  ],
);

export const medicalSpecialties = pgTable(
  'medical_specialties',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: text().notNull(),
    name: text().notNull(),
    description: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('medical_specialties_code_key').on(table.code),
    check(
      'medical_specialties_code_format',
      sql`code ~ '^[a-z][a-z0-9_]*$'::text`,
    ),
  ],
);

export const clinicServiceComplaints = pgTable(
  'clinic_service_complaints',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    serviceId: uuid('service_id').notNull(),
    complaintText: text('complaint_text').notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [clinicServices.id],
      name: 'clinic_service_complaints_service_id_fkey',
    }).onDelete('cascade'),
    check(
      'clinic_service_complaints_text_not_blank',
      sql`length(TRIM(BOTH FROM complaint_text)) > 0`,
    ),
  ],
);

export const patientProfiles = pgTable(
  'patient_profiles',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id'),
    medicalRecordNumber: text('medical_record_number').notNull(),
    fullName: text('full_name').notNull(),
    nationalIdHash: text('national_id_hash'),
    nationalIdEncrypted: text('national_id_encrypted'),
    motherName: text('mother_name'),
    birthPlace: text('birth_place'),
    birthDate: date('birth_date').notNull(),
    gender: gender().notNull(),
    bloodType: bloodType('blood_type').default('unknown').notNull(),
    occupation: text(),
    phone: text(),
    email: citext('email'),
    avatarUrl: text('avatar_url'),
    status: patientStatus().default('active').notNull(),
    medicalHistorySummary: text('medical_history_summary'),
    registeredAt: timestamp('registered_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    firstLoginAt: timestamp('first_login_at', {
      withTimezone: true,
      mode: 'string',
    }),
    lastVisitAt: timestamp('last_visit_at', {
      withTimezone: true,
      mode: 'string',
    }),
    visitCount: integer('visit_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('patient_profiles_mrn_trgm_idx').using(
      'gin',
      table.medicalRecordNumber.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('patient_profiles_name_trgm_idx').using(
      'gin',
      table.fullName.asc().nullsLast().op('gin_trgm_ops'),
    ),
    uniqueIndex('patient_profiles_national_id_hash_unique')
      .using('btree', table.nationalIdHash.asc().nullsLast().op('text_ops'))
      .where(sql`(national_id_hash IS NOT NULL)`),
    index('patient_profiles_status_idx').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'patient_profiles_user_id_fkey',
    }).onDelete('set null'),
    unique('patient_profiles_user_id_key').on(table.userId),
    unique('patient_profiles_medical_record_number_key').on(
      table.medicalRecordNumber,
    ),
    check(
      'patient_profiles_full_name_not_blank',
      sql`length(TRIM(BOTH FROM full_name)) > 0`,
    ),
    check(
      'patient_profiles_mrn_not_blank',
      sql`length(TRIM(BOTH FROM medical_record_number)) > 0`,
    ),
    check('patient_profiles_visit_count_nonnegative', sql`visit_count >= 0`),
  ],
);

export const patientAddresses = pgTable(
  'patient_addresses',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientId: uuid('patient_id').notNull(),
    type: addressType().default('domicile').notNull(),
    provinceCode: text('province_code'),
    provinceName: text('province_name'),
    regencyCode: text('regency_code'),
    regencyName: text('regency_name'),
    districtCode: text('district_code'),
    districtName: text('district_name'),
    villageCode: text('village_code'),
    villageName: text('village_name'),
    line1: text().notNull(),
    fullAddress: text('full_address').notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('patient_addresses_one_primary_per_type')
      .using(
        'btree',
        table.patientId.asc().nullsLast().op('uuid_ops'),
        table.type.asc().nullsLast().op('uuid_ops'),
      )
      .where(sql`is_primary`),
    index('patient_addresses_patient_idx').using(
      'btree',
      table.patientId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'patient_addresses_patient_id_fkey',
    }).onDelete('cascade'),
    check(
      'patient_addresses_full_address_not_blank',
      sql`length(TRIM(BOTH FROM full_address)) > 0`,
    ),
    check(
      'patient_addresses_line1_not_blank',
      sql`length(TRIM(BOTH FROM line1)) > 0`,
    ),
  ],
);

export const patientEmergencyContacts = pgTable(
  'patient_emergency_contacts',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientId: uuid('patient_id').notNull(),
    name: text(),
    relationship: text(),
    phone: text().notNull(),
    notes: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'patient_emergency_contacts_patient_id_fkey',
    }).onDelete('cascade'),
    check(
      'patient_emergency_contacts_phone_not_blank',
      sql`length(TRIM(BOTH FROM phone)) > 0`,
    ),
  ],
);

export const patientAllergies = pgTable(
  'patient_allergies',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientId: uuid('patient_id').notNull(),
    substance: text().notNull(),
    reaction: text(),
    severity: text(),
    notes: text(),
    recordedBy: uuid('recorded_by'),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('patient_allergies_patient_idx').using(
      'btree',
      table.patientId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'patient_allergies_patient_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.recordedBy],
      foreignColumns: [users.id],
      name: 'patient_allergies_recorded_by_fkey',
    }).onDelete('set null'),
    check(
      'patient_allergies_substance_not_blank',
      sql`length(TRIM(BOTH FROM substance)) > 0`,
    ),
  ],
);

export const staffProfiles = pgTable(
  'staff_profiles',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id'),
    primaryUnitId: uuid('primary_unit_id'),
    staffCode: text('staff_code').notNull(),
    fullName: text('full_name').notNull(),
    staffType: staffType('staff_type').notNull(),
    status: staffStatus().default('active').notNull(),
    positionTitle: text('position_title'),
    departmentName: text('department_name'),
    phone: text(),
    email: citext('email'),
    avatarUrl: text('avatar_url'),
    hiredAt: date('hired_at'),
    endedAt: date('ended_at'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('staff_profiles_name_trgm_idx').using(
      'gin',
      table.fullName.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('staff_profiles_type_status_idx').using(
      'btree',
      table.staffType.asc().nullsLast().op('enum_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    index('staff_profiles_unit_idx').using(
      'btree',
      table.primaryUnitId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.primaryUnitId],
      foreignColumns: [clinicUnits.id],
      name: 'staff_profiles_primary_unit_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'staff_profiles_user_id_fkey',
    }).onDelete('set null'),
    unique('staff_profiles_user_id_key').on(table.userId),
    unique('staff_profiles_staff_code_key').on(table.staffCode),
    check(
      'staff_profiles_code_not_blank',
      sql`length(TRIM(BOTH FROM staff_code)) > 0`,
    ),
    check(
      'staff_profiles_employment_dates',
      sql`(ended_at IS NULL) OR (hired_at IS NULL) OR (ended_at >= hired_at)`,
    ),
    check(
      'staff_profiles_name_not_blank',
      sql`length(TRIM(BOTH FROM full_name)) > 0`,
    ),
  ],
);

export const practitioners = pgTable(
  'practitioners',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    staffProfileId: uuid('staff_profile_id').notNull(),
    specialtyId: uuid('specialty_id'),
    defaultRoomId: uuid('default_room_id'),
    displayName: text('display_name').notNull(),
    licenseNumber: text('license_number'),
    bio: text(),
    rating: numeric({ precision: 3, scale: 2 }),
    tags: text().array().default(['']).notNull(),
    isAcceptingAppointments: boolean('is_accepting_appointments')
      .default(true)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practitioners_specialty_idx').using(
      'btree',
      table.specialtyId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.defaultRoomId],
      foreignColumns: [clinicRooms.id],
      name: 'practitioners_default_room_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.specialtyId],
      foreignColumns: [medicalSpecialties.id],
      name: 'practitioners_specialty_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.staffProfileId],
      foreignColumns: [staffProfiles.id],
      name: 'practitioners_staff_profile_id_fkey',
    }).onDelete('restrict'),
    unique('practitioners_staff_profile_id_key').on(table.staffProfileId),
    unique('practitioners_license_number_key').on(table.licenseNumber),
    check(
      'practitioners_display_name_not_blank',
      sql`length(TRIM(BOTH FROM display_name)) > 0`,
    ),
    check(
      'practitioners_rating_range',
      sql`(rating IS NULL) OR ((rating >= (0)::numeric) AND (rating <= (5)::numeric))`,
    ),
  ],
);

export const staffCredentials = pgTable(
  'staff_credentials',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    staffProfileId: uuid('staff_profile_id').notNull(),
    credentialType: staffCredentialType('credential_type').notNull(),
    credentialNumberHash: text('credential_number_hash').notNull(),
    credentialNumberEncrypted: text('credential_number_encrypted').notNull(),
    issuer: text(),
    issuedAt: date('issued_at'),
    expiresAt: date('expires_at'),
    status: staffCredentialStatus().default('unverified').notNull(),
    verifiedAt: timestamp('verified_at', {
      withTimezone: true,
      mode: 'string',
    }),
    verifiedBy: uuid('verified_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('staff_credentials_staff_type_idx').using(
      'btree',
      table.staffProfileId.asc().nullsLast().op('uuid_ops'),
      table.credentialType.asc().nullsLast().op('enum_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    uniqueIndex('staff_credentials_type_hash_unique').using(
      'btree',
      table.credentialType.asc().nullsLast().op('text_ops'),
      table.credentialNumberHash.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.staffProfileId],
      foreignColumns: [staffProfiles.id],
      name: 'staff_credentials_staff_profile_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.verifiedBy],
      foreignColumns: [users.id],
      name: 'staff_credentials_verified_by_fkey',
    }).onDelete('set null'),
    unique('staff_credentials_unique_per_staff').on(
      table.staffProfileId,
      table.credentialType,
      table.credentialNumberHash,
    ),
    check(
      'staff_credentials_date_order',
      sql`(expires_at IS NULL) OR (issued_at IS NULL) OR (expires_at >= issued_at)`,
    ),
    check(
      'staff_credentials_number_encrypted_not_blank',
      sql`length(TRIM(BOTH FROM credential_number_encrypted)) > 0`,
    ),
    check(
      'staff_credentials_number_hash_not_blank',
      sql`length(TRIM(BOTH FROM credential_number_hash)) > 0`,
    ),
  ],
);

export const practitionerAvailability = pgTable(
  'practitioner_availability',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    practitionerId: uuid('practitioner_id').notNull(),
    dayOfWeek: smallint('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    capacity: integer().default(0).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practitioner_availability_practitioner_day_idx').using(
      'btree',
      table.practitionerId.asc().nullsLast().op('int2_ops'),
      table.dayOfWeek.asc().nullsLast().op('int2_ops'),
      table.isActive.asc().nullsLast().op('int2_ops'),
    ),
    foreignKey({
      columns: [table.practitionerId],
      foreignColumns: [practitioners.id],
      name: 'practitioner_availability_practitioner_id_fkey',
    }).onDelete('cascade'),
    check('practitioner_availability_capacity_nonnegative', sql`capacity >= 0`),
    check(
      'practitioner_availability_day_range',
      sql`(day_of_week >= 0) AND (day_of_week <= 6)`,
    ),
    check(
      'practitioner_availability_effective_order',
      sql`(effective_to IS NULL) OR (effective_to >= effective_from)`,
    ),
    check('practitioner_availability_time_order', sql`end_time > start_time`),
  ],
);

export const practitionerScheduleDaySettings = pgTable(
  'practitioner_schedule_day_settings',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    practitionerId: uuid('practitioner_id').notNull(),
    scheduleDate: date('schedule_date').notNull(),
    targetQuota: integer('target_quota').default(0).notNull(),
    isLeave: boolean('is_leave').default(false).notNull(),
    leaveReason: text('leave_reason'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practitioner_schedule_day_settings_practitioner_date_idx').using(
      'btree',
      table.practitionerId.asc().nullsLast().op('date_ops'),
      table.scheduleDate.asc().nullsLast().op('date_ops'),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'practitioner_schedule_day_settings_created_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.practitionerId],
      foreignColumns: [practitioners.id],
      name: 'practitioner_schedule_day_settings_practitioner_id_fkey',
    }).onDelete('cascade'),
    unique('practitioner_day_settings_unique').on(
      table.practitionerId,
      table.scheduleDate,
    ),
    check(
      'practitioner_day_settings_leave_reason_not_blank',
      sql`(leave_reason IS NULL) OR (length(TRIM(BOTH FROM leave_reason)) > 0)`,
    ),
    check(
      'practitioner_day_settings_target_quota_nonnegative',
      sql`target_quota >= 0`,
    ),
  ],
);

export const staffLeaveRequests = pgTable(
  'staff_leave_requests',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    staffProfileId: uuid('staff_profile_id').notNull(),
    practitionerId: uuid('practitioner_id'),
    requestType: staffLeaveRequestType('request_type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    durationDays: integer('duration_days').notNull(),
    reason: text().notNull(),
    substitutePractitionerId: uuid('substitute_practitioner_id'),
    substituteNameSnapshot: text('substitute_name_snapshot'),
    status: staffLeaveRequestStatus().default('pending').notNull(),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    reviewerNotes: text('reviewer_notes'),
    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('staff_leave_requests_reviewer_idx')
      .using(
        'btree',
        table.reviewedBy.asc().nullsLast().op('timestamptz_ops'),
        table.reviewedAt.desc().nullsFirst().op('uuid_ops'),
      )
      .where(sql`(reviewed_by IS NOT NULL)`),
    index('staff_leave_requests_staff_status_idx').using(
      'btree',
      table.staffProfileId.asc().nullsLast().op('uuid_ops'),
      table.status.asc().nullsLast().op('uuid_ops'),
      table.startDate.desc().nullsFirst().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.practitionerId],
      foreignColumns: [practitioners.id],
      name: 'staff_leave_requests_practitioner_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [users.id],
      name: 'staff_leave_requests_reviewed_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.staffProfileId],
      foreignColumns: [staffProfiles.id],
      name: 'staff_leave_requests_staff_profile_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.substitutePractitionerId],
      foreignColumns: [practitioners.id],
      name: 'staff_leave_requests_substitute_practitioner_id_fkey',
    }).onDelete('set null'),
    check(
      'staff_leave_requests_cancel_consistency',
      sql`((status = 'cancelled'::staff_leave_request_status) AND (cancelled_at IS NOT NULL)) OR (status <> 'cancelled'::staff_leave_request_status)`,
    ),
    check('staff_leave_requests_date_order', sql`end_date >= start_date`),
    check('staff_leave_requests_duration_positive', sql`duration_days > 0`),
    check(
      'staff_leave_requests_reason_not_blank',
      sql`length(TRIM(BOTH FROM reason)) > 0`,
    ),
    check(
      'staff_leave_requests_review_consistency',
      sql`((status = ANY (ARRAY['approved'::staff_leave_request_status, 'rejected'::staff_leave_request_status])) AND (reviewed_at IS NOT NULL)) OR (status = ANY (ARRAY['pending'::staff_leave_request_status, 'cancelled'::staff_leave_request_status]))`,
    ),
    check(
      'staff_leave_requests_substitute_not_self',
      sql`(substitute_practitioner_id IS NULL) OR (substitute_practitioner_id <> practitioner_id)`,
    ),
  ],
);

export const practitionerLeavePeriods = pgTable(
  'practitioner_leave_periods',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    practitionerId: uuid('practitioner_id').notNull(),
    leaveRequestId: uuid('leave_request_id'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    reason: text(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practitioner_leave_periods_practitioner_dates_idx').using(
      'btree',
      table.practitionerId.asc().nullsLast().op('date_ops'),
      table.startDate.asc().nullsLast().op('date_ops'),
      table.endDate.asc().nullsLast().op('date_ops'),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'practitioner_leave_periods_created_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.leaveRequestId],
      foreignColumns: [staffLeaveRequests.id],
      name: 'practitioner_leave_periods_leave_request_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.practitionerId],
      foreignColumns: [practitioners.id],
      name: 'practitioner_leave_periods_practitioner_id_fkey',
    }).onDelete('cascade'),
    unique('practitioner_leave_periods_leave_request_id_key').on(
      table.leaveRequestId,
    ),
    check('practitioner_leave_periods_date_order', sql`end_date >= start_date`),
  ],
);

export const practitionerScheduleSessions = pgTable(
  'practitioner_schedule_sessions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    practitionerId: uuid('practitioner_id').notNull(),
    daySettingId: uuid('day_setting_id'),
    serviceId: uuid('service_id'),
    roomId: uuid('room_id'),
    scheduleDate: date('schedule_date').notNull(),
    sessionLabel: text('session_label').notNull(),
    sessionShift: staffShift('session_shift'),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    capacity: integer().default(0).notNull(),
    availableSlots: integer('available_slots').default(0).notNull(),
    status: scheduleStatus().default('open').notNull(),
    notes: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('practitioner_schedule_sessions_practitioner_date_idx').using(
      'btree',
      table.practitionerId.asc().nullsLast().op('enum_ops'),
      table.scheduleDate.asc().nullsLast().op('uuid_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.daySettingId],
      foreignColumns: [practitionerScheduleDaySettings.id],
      name: 'practitioner_schedule_sessions_day_setting_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.practitionerId],
      foreignColumns: [practitioners.id],
      name: 'practitioner_schedule_sessions_practitioner_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [clinicRooms.id],
      name: 'practitioner_schedule_sessions_room_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [clinicServices.id],
      name: 'practitioner_schedule_sessions_service_id_fkey',
    }).onDelete('set null'),
    unique('practitioner_schedule_sessions_unique').on(
      table.practitionerId,
      table.scheduleDate,
      table.startTime,
    ),
    check(
      'practitioner_schedule_sessions_available_lte_capacity',
      sql`available_slots <= capacity`,
    ),
    check(
      'practitioner_schedule_sessions_available_slots_nonnegative',
      sql`available_slots >= 0`,
    ),
    check(
      'practitioner_schedule_sessions_capacity_nonnegative',
      sql`capacity >= 0`,
    ),
    check(
      'practitioner_schedule_sessions_time_order',
      sql`end_time > start_time`,
    ),
  ],
);

export const appointments = pgTable(
  'appointments',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    bookingCode: text('booking_code').notNull(),
    patientId: uuid('patient_id').notNull(),
    practitionerId: uuid('practitioner_id'),
    scheduleSessionId: uuid('schedule_session_id'),
    serviceId: uuid('service_id').notNull(),
    roomId: uuid('room_id'),
    visitType: visitType('visit_type').default('new_visit').notNull(),
    status: appointmentStatus().default('booked').notNull(),
    scheduledDate: date('scheduled_date').notNull(),
    scheduledStartTime: time('scheduled_start_time').notNull(),
    scheduledEndTime: time('scheduled_end_time'),
    complaint: text(),
    guardianNameSnapshot: text('guardian_name_snapshot'),
    medicalFlow: medicalFlowType('medical_flow'),
    checkedInAt: timestamp('checked_in_at', {
      withTimezone: true,
      mode: 'string',
    }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
      mode: 'string',
    }),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('appointments_active_practitioner_slot_unique')
      .using(
        'btree',
        table.practitionerId.asc().nullsLast().op('uuid_ops'),
        table.scheduledDate.asc().nullsLast().op('date_ops'),
        table.scheduledStartTime.asc().nullsLast().op('date_ops'),
      )
      .where(
        sql`((practitioner_id IS NOT NULL) AND (status = ANY (ARRAY['booked'::appointment_status, 'checked_in'::appointment_status, 'waiting'::appointment_status, 'in_service'::appointment_status])))`,
      ),
    index('appointments_complaint_trgm_idx').using(
      'gin',
      table.complaint.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('appointments_patient_date_idx').using(
      'btree',
      table.patientId.asc().nullsLast().op('uuid_ops'),
      table.scheduledDate.desc().nullsFirst().op('uuid_ops'),
    ),
    index('appointments_practitioner_date_status_idx').using(
      'btree',
      table.practitionerId.asc().nullsLast().op('date_ops'),
      table.scheduledDate.asc().nullsLast().op('uuid_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    index('appointments_schedule_session_idx').using(
      'btree',
      table.scheduleSessionId.asc().nullsLast().op('uuid_ops'),
    ),
    index('appointments_service_date_status_idx').using(
      'btree',
      table.serviceId.asc().nullsLast().op('uuid_ops'),
      table.scheduledDate.asc().nullsLast().op('uuid_ops'),
      table.status.asc().nullsLast().op('uuid_ops'),
    ),
    index('appointments_status_idx').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'appointments_created_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'appointments_patient_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.practitionerId],
      foreignColumns: [practitioners.id],
      name: 'appointments_practitioner_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [clinicRooms.id],
      name: 'appointments_room_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.scheduleSessionId],
      foreignColumns: [practitionerScheduleSessions.id],
      name: 'appointments_schedule_session_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [clinicServices.id],
      name: 'appointments_service_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [users.id],
      name: 'appointments_updated_by_fkey',
    }).onDelete('set null'),
    unique('appointments_booking_code_key').on(table.bookingCode),
    check(
      'appointments_booking_code_not_blank',
      sql`length(TRIM(BOTH FROM booking_code)) > 0`,
    ),
    check(
      'appointments_time_order',
      sql`(scheduled_end_time IS NULL) OR (scheduled_end_time > scheduled_start_time)`,
    ),
  ],
);

export const appointmentStatusEvents = pgTable(
  'appointment_status_events',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    appointmentId: uuid('appointment_id').notNull(),
    previousStatus: appointmentStatus('previous_status'),
    newStatus: appointmentStatus('new_status').notNull(),
    changedBy: uuid('changed_by'),
    reason: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('appointment_status_events_appointment_idx').using(
      'btree',
      table.appointmentId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [appointments.id],
      name: 'appointment_status_events_appointment_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.changedBy],
      foreignColumns: [users.id],
      name: 'appointment_status_events_changed_by_fkey',
    }).onDelete('set null'),
  ],
);

export const queueTickets = pgTable(
  'queue_tickets',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    appointmentId: uuid('appointment_id').notNull(),
    serviceId: uuid('service_id').notNull(),
    roomId: uuid('room_id'),
    queueDate: date('queue_date').notNull(),
    queueNumber: text('queue_number').notNull(),
    priority: queuePriority().default('regular').notNull(),
    guardianNameSnapshot: text('guardian_name_snapshot'),
    status: queueStatus().default('waiting').notNull(),
    waitingPosition: integer('waiting_position'),
    estimatedCalledAt: timestamp('estimated_called_at', {
      withTimezone: true,
      mode: 'string',
    }),
    calledAt: timestamp('called_at', { withTimezone: true, mode: 'string' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('queue_tickets_live_idx').using(
      'btree',
      table.queueDate.asc().nullsLast().op('date_ops'),
      table.serviceId.asc().nullsLast().op('enum_ops'),
      table.status.asc().nullsLast().op('date_ops'),
    ),
    index('queue_tickets_priority_idx').using(
      'btree',
      table.queueDate.asc().nullsLast().op('date_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
      table.priority.asc().nullsLast().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [appointments.id],
      name: 'queue_tickets_appointment_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [clinicRooms.id],
      name: 'queue_tickets_room_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [clinicServices.id],
      name: 'queue_tickets_service_id_fkey',
    }).onDelete('restrict'),
    unique('queue_tickets_appointment_id_key').on(table.appointmentId),
    unique('queue_tickets_unique_number_per_service_date').on(
      table.serviceId,
      table.queueDate,
      table.queueNumber,
    ),
    check(
      'queue_tickets_number_not_blank',
      sql`length(TRIM(BOTH FROM queue_number)) > 0`,
    ),
    check(
      'queue_tickets_waiting_position_positive',
      sql`(waiting_position IS NULL) OR (waiting_position > 0)`,
    ),
  ],
);

export const medicalIntakeSubmissions = pgTable(
  'medical_intake_submissions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    appointmentId: uuid('appointment_id'),
    patientId: uuid('patient_id').notNull(),
    flow: medicalFlowType().notNull(),
    schemaVersion: text('schema_version').default('v1').notNull(),
    schemaTitle: text('schema_title').notNull(),
    answers: jsonb().notNull(),
    automatic: jsonb().default({}).notNull(),
    submittedBy: uuid('submitted_by'),
    submittedAt: timestamp('submitted_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('medical_intake_answers_gin_idx').using(
      'gin',
      table.answers.asc().nullsLast().op('jsonb_path_ops'),
    ),
    index('medical_intake_patient_idx').using(
      'btree',
      table.patientId.asc().nullsLast().op('timestamptz_ops'),
      table.submittedAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [appointments.id],
      name: 'medical_intake_submissions_appointment_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'medical_intake_submissions_patient_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.submittedBy],
      foreignColumns: [users.id],
      name: 'medical_intake_submissions_submitted_by_fkey',
    }).onDelete('set null'),
    check(
      'medical_intake_answers_object',
      sql`jsonb_typeof(answers) = 'object'::text`,
    ),
    check(
      'medical_intake_automatic_object',
      sql`jsonb_typeof(automatic) = 'object'::text`,
    ),
  ],
);

export const clinicalEncounters = pgTable(
  'clinical_encounters',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    appointmentId: uuid('appointment_id'),
    patientId: uuid('patient_id').notNull(),
    practitionerId: uuid('practitioner_id'),
    serviceId: uuid('service_id'),
    sourceIntakeId: uuid('source_intake_id'),
    encounterDate: date('encounter_date').notNull(),
    status: encounterStatus().default('planned').notNull(),
    subjectiveNotes: text('subjective_notes'),
    objectiveNotes: text('objective_notes'),
    assessment: text(),
    plan: text(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('clinical_encounters_patient_date_idx').using(
      'btree',
      table.patientId.asc().nullsLast().op('date_ops'),
      table.encounterDate.desc().nullsFirst().op('uuid_ops'),
    ),
    index('clinical_encounters_practitioner_date_idx').using(
      'btree',
      table.practitionerId.asc().nullsLast().op('date_ops'),
      table.encounterDate.desc().nullsFirst().op('date_ops'),
    ),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [appointments.id],
      name: 'clinical_encounters_appointment_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'clinical_encounters_created_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'clinical_encounters_patient_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.practitionerId],
      foreignColumns: [practitioners.id],
      name: 'clinical_encounters_practitioner_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.serviceId],
      foreignColumns: [clinicServices.id],
      name: 'clinical_encounters_service_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.sourceIntakeId],
      foreignColumns: [medicalIntakeSubmissions.id],
      name: 'clinical_encounters_source_intake_id_fkey',
    }).onDelete('set null'),
    unique('clinical_encounters_appointment_id_key').on(table.appointmentId),
  ],
);

export const attendanceQrSessions = pgTable(
  'attendance_qr_sessions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    codeHash: text('code_hash').notNull(),
    sessionType: attendanceQrSessionType('session_type')
      .default('location_check_in')
      .notNull(),
    staffProfileId: uuid('staff_profile_id'),
    roomId: uuid('room_id'),
    unitId: uuid('unit_id'),
    context: text(),
    shift: staffShift(),
    manualPinHash: text('manual_pin_hash'),
    validFrom: timestamp('valid_from', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    validUntil: timestamp('valid_until', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    rotationSeconds: integer('rotation_seconds').default(30).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('attendance_qr_sessions_active_idx').using(
      'btree',
      table.sessionType.asc().nullsLast().op('timestamptz_ops'),
      table.isActive.asc().nullsLast().op('bool_ops'),
      table.validFrom.asc().nullsLast().op('timestamptz_ops'),
      table.validUntil.asc().nullsLast().op('bool_ops'),
    ),
    index('attendance_qr_sessions_staff_idx').using(
      'btree',
      table.staffProfileId.asc().nullsLast().op('timestamptz_ops'),
      table.validUntil.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'attendance_qr_sessions_created_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [clinicRooms.id],
      name: 'attendance_qr_sessions_room_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.staffProfileId],
      foreignColumns: [staffProfiles.id],
      name: 'attendance_qr_sessions_staff_profile_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [clinicUnits.id],
      name: 'attendance_qr_sessions_unit_id_fkey',
    }).onDelete('set null'),
    unique('attendance_qr_sessions_code_hash_key').on(table.codeHash),
    check(
      'attendance_qr_code_hash_not_blank',
      sql`length(TRIM(BOTH FROM code_hash)) > 0`,
    ),
    check(
      'attendance_qr_manual_pin_hash_not_blank',
      sql`(manual_pin_hash IS NULL) OR (length(TRIM(BOTH FROM manual_pin_hash)) > 0)`,
    ),
    check('attendance_qr_rotation_positive', sql`rotation_seconds > 0`),
    check(
      'attendance_qr_staff_identity_requires_staff',
      sql`(session_type <> 'staff_identity'::attendance_qr_session_type) OR (staff_profile_id IS NOT NULL)`,
    ),
    check('attendance_qr_valid_order', sql`valid_until > valid_from`),
  ],
);

export const staffAttendanceRecords = pgTable(
  'staff_attendance_records',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    staffProfileId: uuid('staff_profile_id').notNull(),
    qrSessionId: uuid('qr_session_id'),
    leaveRequestId: uuid('leave_request_id'),
    unitId: uuid('unit_id'),
    roomId: uuid('room_id'),
    deviceId: uuid('device_id'),
    attendanceDate: date('attendance_date').notNull(),
    shift: staffShift().notNull(),
    status: attendanceStatus().default('absent').notNull(),
    expectedCheckInAt: timestamp('expected_check_in_at', {
      withTimezone: true,
      mode: 'string',
    }),
    checkInAt: timestamp('check_in_at', { withTimezone: true, mode: 'string' }),
    checkOutAt: timestamp('check_out_at', {
      withTimezone: true,
      mode: 'string',
    }),
    lateMinutes: integer('late_minutes'),
    recordedMethod: attendanceMethod('recorded_method')
      .default('system')
      .notNull(),
    recordedBy: uuid('recorded_by'),
    locationLabel: text('location_label'),
    sourceCodeHash: text('source_code_hash'),
    notes: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('staff_attendance_date_shift_status_idx').using(
      'btree',
      table.attendanceDate.asc().nullsLast().op('date_ops'),
      table.shift.asc().nullsLast().op('enum_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
    ),
    index('staff_attendance_staff_date_idx').using(
      'btree',
      table.staffProfileId.asc().nullsLast().op('uuid_ops'),
      table.attendanceDate.desc().nullsFirst().op('uuid_ops'),
    ),
    index('staff_attendance_unit_date_idx')
      .using(
        'btree',
        table.unitId.asc().nullsLast().op('date_ops'),
        table.attendanceDate.desc().nullsFirst().op('date_ops'),
        table.status.asc().nullsLast().op('date_ops'),
      )
      .where(sql`(unit_id IS NOT NULL)`),
    foreignKey({
      columns: [table.deviceId],
      foreignColumns: [userDevices.id],
      name: 'staff_attendance_records_device_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.leaveRequestId],
      foreignColumns: [staffLeaveRequests.id],
      name: 'staff_attendance_records_leave_request_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.qrSessionId],
      foreignColumns: [attendanceQrSessions.id],
      name: 'staff_attendance_records_qr_session_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.recordedBy],
      foreignColumns: [users.id],
      name: 'staff_attendance_records_recorded_by_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.roomId],
      foreignColumns: [clinicRooms.id],
      name: 'staff_attendance_records_room_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.staffProfileId],
      foreignColumns: [staffProfiles.id],
      name: 'staff_attendance_records_staff_profile_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.unitId],
      foreignColumns: [clinicUnits.id],
      name: 'staff_attendance_records_unit_id_fkey',
    }).onDelete('set null'),
    unique('staff_attendance_unique_staff_date_shift').on(
      table.staffProfileId,
      table.attendanceDate,
      table.shift,
    ),
    check(
      'staff_attendance_late_minutes_nonnegative',
      sql`(late_minutes IS NULL) OR (late_minutes >= 0)`,
    ),
    check(
      'staff_attendance_source_code_hash_not_blank',
      sql`(source_code_hash IS NULL) OR (length(TRIM(BOTH FROM source_code_hash)) > 0)`,
    ),
    check(
      'staff_attendance_time_order',
      sql`(check_out_at IS NULL) OR (check_in_at IS NULL) OR (check_out_at >= check_in_at)`,
    ),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    category: notificationCategory().notNull(),
    title: text(),
    senderName: text('sender_name'),
    senderRole: text('sender_role'),
    badgeIcon: text('badge_icon'),
    metaIcon: text('meta_icon'),
    visualKey: text('visual_key'),
    body: text().notNull(),
    isUrgent: boolean('is_urgent').default(false).notNull(),
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    metadata: jsonb().default({}).notNull(),
    createdBy: uuid('created_by'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('notifications_category_created_idx').using(
      'btree',
      table.category.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.desc().nullsFirst().op('enum_ops'),
    ),
    index('notifications_urgent_idx')
      .using(
        'btree',
        table.isUrgent.asc().nullsLast().op('timestamptz_ops'),
        table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
      )
      .where(sql`is_urgent`),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'notifications_created_by_fkey',
    }).onDelete('set null'),
    check(
      'notifications_body_not_blank',
      sql`length(TRIM(BOTH FROM body)) > 0`,
    ),
    check(
      'notifications_metadata_object',
      sql`jsonb_typeof(metadata) = 'object'::text`,
    ),
  ],
);

export const notificationActions = pgTable(
  'notification_actions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    notificationId: uuid('notification_id').notNull(),
    label: text().notNull(),
    actionKey: text('action_key').notNull(),
    actionType: notificationActionType('action_type')
      .default('secondary')
      .notNull(),
    icon: text(),
    url: text(),
    metadata: jsonb().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.notificationId],
      foreignColumns: [notifications.id],
      name: 'notification_actions_notification_id_fkey',
    }).onDelete('cascade'),
    check(
      'notification_actions_key_not_blank',
      sql`length(TRIM(BOTH FROM action_key)) > 0`,
    ),
    check(
      'notification_actions_label_not_blank',
      sql`length(TRIM(BOTH FROM label)) > 0`,
    ),
    check(
      'notification_actions_metadata_object',
      sql`jsonb_typeof(metadata) = 'object'::text`,
    ),
  ],
);

export const notificationRecipients = pgTable(
  'notification_recipients',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    notificationId: uuid('notification_id').notNull(),
    userId: uuid('user_id').notNull(),
    deliveredAt: timestamp('delivered_at', {
      withTimezone: true,
      mode: 'string',
    }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
    dismissedAt: timestamp('dismissed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('notification_recipients_user_unread_idx')
      .using(
        'btree',
        table.userId.asc().nullsLast().op('timestamptz_ops'),
        table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
      )
      .where(sql`((read_at IS NULL) AND (dismissed_at IS NULL))`),
    foreignKey({
      columns: [table.notificationId],
      foreignColumns: [notifications.id],
      name: 'notification_recipients_notification_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'notification_recipients_user_id_fkey',
    }).onDelete('cascade'),
    unique('notification_recipients_unique').on(
      table.notificationId,
      table.userId,
    ),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientId: uuid('patient_id').notNull(),
    assignedPractitionerId: uuid('assigned_practitioner_id'),
    assignedStaffId: uuid('assigned_staff_id'),
    currentPatientStatus: appointmentStatus('current_patient_status'),
    lastMessageAt: timestamp('last_message_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('conversations_last_message_idx').using(
      'btree',
      table.lastMessageAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    index('conversations_patient_idx').using(
      'btree',
      table.patientId.asc().nullsLast().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.assignedPractitionerId],
      foreignColumns: [practitioners.id],
      name: 'conversations_assigned_practitioner_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.assignedStaffId],
      foreignColumns: [staffProfiles.id],
      name: 'conversations_assigned_staff_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'conversations_patient_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    conversationId: uuid('conversation_id').notNull(),
    userId: uuid('user_id'),
    role: conversationParticipantRole().notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    lastReadAt: timestamp('last_read_at', {
      withTimezone: true,
      mode: 'string',
    }),
    isMuted: boolean('is_muted').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('conversation_participants_unique_user')
      .using(
        'btree',
        table.conversationId.asc().nullsLast().op('uuid_ops'),
        table.userId.asc().nullsLast().op('uuid_ops'),
      )
      .where(sql`(user_id IS NOT NULL)`),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: 'conversation_participants_conversation_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'conversation_participants_user_id_fkey',
    }).onDelete('cascade'),
    check(
      'conversation_participants_user_required',
      sql`(role = 'system'::conversation_participant_role) OR (user_id IS NOT NULL)`,
    ),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    conversationId: uuid('conversation_id').notNull(),
    senderUserId: uuid('sender_user_id'),
    senderType: messageSenderType('sender_type').notNull(),
    authorSnapshot: text('author_snapshot').notNull(),
    type: messageType().default('text').notNull(),
    body: text(),
    audioDurationSeconds: integer('audio_duration_seconds'),
    statusUpdateText: text('status_update_text'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'string' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('messages_body_trgm_idx').using(
      'gin',
      table.body.asc().nullsLast().op('gin_trgm_ops'),
    ),
    index('messages_conversation_created_idx').using(
      'btree',
      table.conversationId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: 'messages_conversation_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.senderUserId],
      foreignColumns: [users.id],
      name: 'messages_sender_user_id_fkey',
    }).onDelete('set null'),
    check(
      'messages_audio_duration_nonnegative',
      sql`(audio_duration_seconds IS NULL) OR (audio_duration_seconds >= 0)`,
    ),
    check(
      'messages_author_snapshot_not_blank',
      sql`length(TRIM(BOTH FROM author_snapshot)) > 0`,
    ),
  ],
);

export const files = pgTable(
  'files',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256'),
    accessScope: fileAccessScope('access_scope')
      .default('staff_only')
      .notNull(),
    uploadedBy: uuid('uploaded_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('files_uploaded_by_idx').using(
      'btree',
      table.uploadedBy.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.uploadedBy],
      foreignColumns: [users.id],
      name: 'files_uploaded_by_fkey',
    }).onDelete('set null'),
    unique('files_storage_key_key').on(table.storageKey),
    check('files_byte_size_positive', sql`byte_size > 0`),
    check(
      'files_mime_type_not_blank',
      sql`length(TRIM(BOTH FROM mime_type)) > 0`,
    ),
    check(
      'files_original_name_not_blank',
      sql`length(TRIM(BOTH FROM original_name)) > 0`,
    ),
    check(
      'files_storage_key_not_blank',
      sql`length(TRIM(BOTH FROM storage_key)) > 0`,
    ),
  ],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    ticketNumber: text('ticket_number').notNull(),
    reporterUserId: uuid('reporter_user_id').notNull(),
    assignedStaffId: uuid('assigned_staff_id'),
    title: text().notNull(),
    description: text(),
    status: supportTicketStatus().default('open').notNull(),
    priority: supportTicketPriority().default('normal').notNull(),
    sourceChannel: text('source_channel').default('mobile_app').notNull(),
    technicianNote: text('technician_note'),
    resolvedAt: timestamp('resolved_at', {
      withTimezone: true,
      mode: 'string',
    }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('support_tickets_assignee_status_idx').using(
      'btree',
      table.assignedStaffId.asc().nullsLast().op('timestamptz_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    index('support_tickets_reporter_status_idx').using(
      'btree',
      table.reporterUserId.asc().nullsLast().op('enum_ops'),
      table.status.asc().nullsLast().op('enum_ops'),
      table.createdAt.desc().nullsFirst().op('enum_ops'),
    ),
    foreignKey({
      columns: [table.assignedStaffId],
      foreignColumns: [staffProfiles.id],
      name: 'support_tickets_assigned_staff_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.reporterUserId],
      foreignColumns: [users.id],
      name: 'support_tickets_reporter_user_id_fkey',
    }).onDelete('restrict'),
    unique('support_tickets_ticket_number_key').on(table.ticketNumber),
    check(
      'support_tickets_source_channel_not_blank',
      sql`length(TRIM(BOTH FROM source_channel)) > 0`,
    ),
    check(
      'support_tickets_ticket_number_not_blank',
      sql`length(TRIM(BOTH FROM ticket_number)) > 0`,
    ),
    check(
      'support_tickets_title_not_blank',
      sql`length(TRIM(BOTH FROM title)) > 0`,
    ),
  ],
);

export const supportTicketMessages = pgTable(
  'support_ticket_messages',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    ticketId: uuid('ticket_id').notNull(),
    senderUserId: uuid('sender_user_id'),
    senderType: supportTicketSenderType('sender_type').notNull(),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('support_ticket_messages_ticket_created_idx').using(
      'btree',
      table.ticketId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.senderUserId],
      foreignColumns: [users.id],
      name: 'support_ticket_messages_sender_user_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.ticketId],
      foreignColumns: [supportTickets.id],
      name: 'support_ticket_messages_ticket_id_fkey',
    }).onDelete('cascade'),
    check(
      'support_ticket_messages_body_not_blank',
      sql`length(TRIM(BOTH FROM body)) > 0`,
    ),
    check(
      'support_ticket_messages_sender_required',
      sql`(sender_type = 'system'::support_ticket_sender_type) OR (sender_user_id IS NOT NULL)`,
    ),
  ],
);

export const userDataExportJobs = pgTable(
  'user_data_export_jobs',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    requestedBy: uuid('requested_by').notNull(),
    exportType: dataExportType('export_type').notNull(),
    status: dataExportStatus().default('queued').notNull(),
    parameters: jsonb().default({}).notNull(),
    fileId: uuid('file_id'),
    requestedAt: timestamp('requested_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('user_data_export_jobs_user_status_idx').using(
      'btree',
      table.requestedBy.asc().nullsLast().op('timestamptz_ops'),
      table.status.asc().nullsLast().op('timestamptz_ops'),
      table.requestedAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'user_data_export_jobs_file_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.requestedBy],
      foreignColumns: [users.id],
      name: 'user_data_export_jobs_requested_by_fkey',
    }).onDelete('cascade'),
    check(
      'user_data_export_jobs_completion_consistency',
      sql`((status = 'completed'::data_export_status) AND (completed_at IS NOT NULL) AND (file_id IS NOT NULL)) OR (status <> 'completed'::data_export_status)`,
    ),
    check(
      'user_data_export_jobs_parameters_object',
      sql`jsonb_typeof(parameters) = 'object'::text`,
    ),
  ],
);

export const patientTimelineEvents = pgTable(
  'patient_timeline_events',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientId: uuid('patient_id').notNull(),
    conversationId: uuid('conversation_id'),
    appointmentId: uuid('appointment_id'),
    eventType: text('event_type').notNull(),
    title: text().notNull(),
    subtitle: text(),
    eventAt: timestamp('event_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    iconType: text('icon_type'),
    actionLabel: text('action_label'),
    metadata: jsonb().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('patient_timeline_patient_event_idx').using(
      'btree',
      table.patientId.asc().nullsLast().op('timestamptz_ops'),
      table.eventAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [appointments.id],
      name: 'patient_timeline_events_appointment_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.id],
      name: 'patient_timeline_events_conversation_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'patient_timeline_events_patient_id_fkey',
    }).onDelete('cascade'),
    check(
      'patient_timeline_events_metadata_object',
      sql`jsonb_typeof(metadata) = 'object'::text`,
    ),
    check(
      'patient_timeline_events_title_not_blank',
      sql`length(TRIM(BOTH FROM title)) > 0`,
    ),
    check(
      'patient_timeline_events_type_not_blank',
      sql`length(TRIM(BOTH FROM event_type)) > 0`,
    ),
  ],
);

export const publicTestimonials = pgTable(
  'public_testimonials',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    patientId: uuid('patient_id'),
    authorName: text('author_name').notNull(),
    authorRole: text('author_role'),
    quote: text().notNull(),
    mediaUrl: text('media_url'),
    isPublished: boolean('is_published').default(false).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'public_testimonials_patient_id_fkey',
    }).onDelete('set null'),
    check(
      'public_testimonials_author_not_blank',
      sql`length(TRIM(BOTH FROM author_name)) > 0`,
    ),
    check(
      'public_testimonials_quote_not_blank',
      sql`length(TRIM(BOTH FROM quote)) > 0`,
    ),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    actorUserId: uuid('actor_user_id'),
    actorRoleCode: text('actor_role_code'),
    action: text().notNull(),
    entityTable: text('entity_table').notNull(),
    entityId: uuid('entity_id'),
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_logs_action_created_idx').using(
      'btree',
      table.action.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    index('audit_logs_actor_created_idx').using(
      'btree',
      table.actorUserId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.desc().nullsFirst().op('timestamptz_ops'),
    ),
    index('audit_logs_entity_idx').using(
      'btree',
      table.entityTable.asc().nullsLast().op('timestamptz_ops'),
      table.entityId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.desc().nullsFirst().op('uuid_ops'),
    ),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [users.id],
      name: 'audit_logs_actor_user_id_fkey',
    }).onDelete('set null'),
    check(
      'audit_logs_action_not_blank',
      sql`length(TRIM(BOTH FROM action)) > 0`,
    ),
    check(
      'audit_logs_entity_table_not_blank',
      sql`length(TRIM(BOTH FROM entity_table)) > 0`,
    ),
    check(
      'audit_logs_new_values_object',
      sql`(new_values IS NULL) OR (jsonb_typeof(new_values) = 'object'::text)`,
    ),
    check(
      'audit_logs_old_values_object',
      sql`(old_values IS NULL) OR (jsonb_typeof(old_values) = 'object'::text)`,
    ),
  ],
);

export const authVerifications = pgTable(
  'auth_verifications',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    identifierHash: text('identifier_hash').notNull(),
    valueHash: text('value_hash').notNull(),
    purpose: authVerificationPurpose().notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    consumedAt: timestamp('consumed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('auth_verifications_lookup_idx').using(
      'btree',
      table.identifierHash.asc().nullsLast().op('text_ops'),
      table.purpose.asc().nullsLast().op('enum_ops'),
      table.expiresAt.asc().nullsLast().op('enum_ops'),
    ),
    check(
      'auth_verifications_attempt_count_nonnegative',
      sql`attempt_count >= 0`,
    ),
    check(
      'auth_verifications_identifier_hash_not_blank',
      sql`length(TRIM(BOTH FROM identifier_hash)) > 0`,
    ),
    check(
      'auth_verifications_value_hash_not_blank',
      sql`length(TRIM(BOTH FROM value_hash)) > 0`,
    ),
  ],
);

export const clinicProfiles = pgTable('clinic_profiles', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  shortName: text('short_name').notNull(),
  legalName: text('legal_name'),
  phone: text(),
  whatsapp: text(),
  email: citext('email'),
  website: text(),
  instagram: text(),
  tiktok: text(),
  facebook: text(),
  address: text(),
  region: text(),
  plusCode: text('plus_code'),
  mapUrl: text('map_url'),
  emergencyNotice: text('emergency_notice'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
});

export const supportFaqs = pgTable(
  'support_faqs',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    category: text().notNull(),
    title: text().notNull(),
    solutionSteps: text('solution_steps').array().default(['']).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    isPublished: boolean('is_published').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('support_faqs_published_idx').using(
      'btree',
      table.isPublished.asc().nullsLast().op('int4_ops'),
      table.displayOrder.asc().nullsLast().op('int4_ops'),
    ),
    check(
      'support_faqs_category_not_blank',
      sql`length(TRIM(BOTH FROM category)) > 0`,
    ),
    check(
      'support_faqs_solution_steps_not_empty',
      sql`cardinality(solution_steps) > 0`,
    ),
    check(
      'support_faqs_title_not_blank',
      sql`length(TRIM(BOTH FROM title)) > 0`,
    ),
  ],
);

export const clinicFacilities = pgTable(
  'clinic_facilities',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    slug: text().notNull(),
    title: text().notNull(),
    summary: text(),
    imageUrl: text('image_url'),
    displayOrder: integer('display_order').default(0).notNull(),
    isPublished: boolean('is_published').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('clinic_facilities_slug_key').on(table.slug),
    check(
      'clinic_facilities_slug_format',
      sql`slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text`,
    ),
    check(
      'clinic_facilities_title_not_blank',
      sql`length(TRIM(BOTH FROM title)) > 0`,
    ),
  ],
);

export const publicReviews = pgTable(
  'public_reviews',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    source: reviewSource().default('manual').notNull(),
    sourceReviewId: text('source_review_id'),
    authorName: text('author_name').notNull(),
    authorAvatarUrl: text('author_avatar_url'),
    rating: numeric({ precision: 2, scale: 1 }).notNull(),
    body: text(),
    reviewedAt: timestamp('reviewed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    isPublished: boolean('is_published').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('public_reviews_published_idx').using(
      'btree',
      table.isPublished.asc().nullsLast().op('timestamptz_ops'),
      table.reviewedAt.desc().nullsFirst().op('bool_ops'),
    ),
    unique('public_reviews_source_unique').on(
      table.source,
      table.sourceReviewId,
    ),
    check(
      'public_reviews_author_not_blank',
      sql`length(TRIM(BOTH FROM author_name)) > 0`,
    ),
    check(
      'public_reviews_rating_range',
      sql`(rating >= (0)::numeric) AND (rating <= (5)::numeric)`,
    ),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissions.id],
      name: 'role_permissions_permission_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: 'role_permissions_role_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.roleId, table.permissionId],
      name: 'role_permissions_pkey',
    }),
  ],
);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    messageId: uuid('message_id').notNull(),
    fileId: uuid('file_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'message_attachments_file_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.messageId],
      foreignColumns: [messages.id],
      name: 'message_attachments_message_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.messageId, table.fileId],
      name: 'message_attachments_pkey',
    }),
  ],
);

export const supportTicketAttachments = pgTable(
  'support_ticket_attachments',
  {
    messageId: uuid('message_id').notNull(),
    fileId: uuid('file_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [files.id],
      name: 'support_ticket_attachments_file_id_fkey',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.messageId],
      foreignColumns: [supportTicketMessages.id],
      name: 'support_ticket_attachments_message_id_fkey',
    }).onDelete('cascade'),
    primaryKey({
      columns: [table.messageId, table.fileId],
      name: 'support_ticket_attachments_pkey',
    }),
  ],
);
