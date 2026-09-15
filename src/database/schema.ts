import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uuid,
  index,
  text,
  boolean,
  date,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// =========================================================================
// 1. ENUMS
// =========================================================================

export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'PATIENT', 'STAF']);

export const genderEnum = pgEnum('gender_type', ['Laki-laki', 'Perempuan']);

export const bloodTypeEnum = pgEnum('blood_type', [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'Belum Tahu',
]);

export const appointmentSessionEnum = pgEnum('appointment_session', [
  'PAGI',
  'SIANG',
  'MALAM',
]);

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'SUDAH_BUAT_JANJI',
  'SUDAH_DATANG',
  'MENUNGGU',
  'SEDANG_DIPERIKSA',
  'SELESAI',
  'BATAL',
]);

export const visitTypeEnum = pgEnum('visit_type', [
  'Pemeriksaan Baru',
  'Kontrol Ulang',
]);

export const attendanceShiftEnum = pgEnum('attendance_shift', [
  'PAGI',
  'SIANG',
  'MALAM',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'HADIR',
  'TERLAMBAT',
  'TIDAK_HADIR',
]);

export const leaveStatusEnum = pgEnum('leave_status', [
  'MENUNGGU_KONFIRMASI',
  'DISETUJUI',
  'DITOLAK',
]);

export const medicalFlowTypeEnum = pgEnum('medical_flow_type', [
  'pregnancy',
  'immunization',
  'general',
]);

// =========================================================================
// 2. CORE AUTH & BOILERPLATE TABLES
// =========================================================================

// Roles Table (Legacy reference from boilerplate + compatible with new roles)
export const roles = pgTable('role', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 255 }),
});

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

// Statuses Table
export const statuses = pgTable('status', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 255 }),
});

export const statusesRelations = relations(statuses, ({ many }) => ({
  users: many(users),
}));

// Files Table
export const files = pgTable('file', {
  id: uuid('id').defaultRandom().primaryKey(),
  path: varchar('path', { length: 2048 }).notNull(),
});

export const filesRelations = relations(files, ({ one }) => ({
  user: one(users, {
    fields: [files.id],
    references: [users.photoId],
  }),
}));

// Users Table
export const users = pgTable(
  'user',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).unique(),
    password: varchar('password', { length: 255 }),
    provider: varchar('provider', { length: 50 }).default('email').notNull(),
    socialId: varchar('socialId', { length: 255 }),
    firstName: varchar('firstName', { length: 255 }),
    lastName: varchar('lastName', { length: 255 }),
    photoId: uuid('photoId').references(() => files.id, {
      onDelete: 'set null',
    }),
    roleId: integer('roleId').references(() => roles.id),
    statusId: integer('statusId').references(() => statuses.id),
    systemRole: userRoleEnum('system_role').default('PATIENT').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
  },
  (table) => [
    index('idx_user_social_id').on(table.socialId),
    index('idx_user_first_name').on(table.firstName),
    index('idx_user_last_name').on(table.lastName),
    index('idx_user_system_role').on(table.systemRole),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  photo: one(files, {
    fields: [users.photoId],
    references: [files.id],
  }),
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  status: one(statuses, {
    fields: [users.statusId],
    references: [statuses.id],
  }),
  sessions: many(sessions),
  patient: one(patients, {
    fields: [users.id],
    references: [patients.userId],
  }),
  staff: one(staffs, {
    fields: [users.id],
    references: [staffs.userId],
  }),
  approvedLeaves: many(staffLeaves),
}));

// Sessions Table
export const sessions = pgTable(
  'session',
  {
    id: serial('id').primaryKey(),
    userId: integer('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hash: varchar('hash', { length: 255 }).notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
  },
  (table) => [index('idx_session_user_id').on(table.userId)],
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// =========================================================================
// 3. MASTER KLINIK & LAYANAN
// =========================================================================

export const poliklinik = pgTable('poliklinik', {
  id: uuid('id').defaultRandom().primaryKey(),
  namaPoli: varchar('nama_poli', { length: 100 }).notNull(),
  kodePoli: varchar('kode_poli', { length: 10 }).notNull().unique(),
  deskripsi: text('deskripsi'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const poliklinikRelations = relations(poliklinik, ({ many }) => ({
  layanan: many(layananPoli),
  staffs: many(staffs),
  kunjungan: many(kunjunganPasien),
}));

export const layananPoli = pgTable(
  'layanan_poli',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    poliklinikId: uuid('poliklinik_id')
      .notNull()
      .references(() => poliklinik.id, { onDelete: 'cascade' }),
    namaLayanan: varchar('nama_layanan', { length: 255 }).notNull(),
    deskripsi: text('deskripsi'),
    medicalFlow: medicalFlowTypeEnum('medical_flow').default('general').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('idx_layanan_poliklinik_id').on(table.poliklinikId)],
);

export const layananPoliRelations = relations(layananPoli, ({ one, many }) => ({
  poliklinik: one(poliklinik, {
    fields: [layananPoli.poliklinikId],
    references: [poliklinik.id],
  }),
  kunjungan: many(kunjunganPasien),
}));

// =========================================================================
// 4. PASIEN & REKAM MEDIS INDUK
// =========================================================================

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    medicalRecordNumber: varchar('medical_record_number', { length: 50 })
      .notNull()
      .unique(),
    nik: varchar('nik', { length: 16 }).notNull().unique(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    gender: genderEnum('gender').notNull(),
    birthPlace: varchar('birth_place', { length: 100 }).notNull(),
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    bloodType: bloodTypeEnum('blood_type').default('Belum Tahu').notNull(),
    namaIbuKandung: varchar('nama_ibu_kandung', { length: 255 }),
    pekerjaan: varchar('pekerjaan', { length: 100 }),
    phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
    address: text('address').notNull(),
    emergencyContactName: varchar('emergency_contact_name', { length: 255 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
    allergies: jsonb('allergies').default([]).notNull(),
    medicalHistory: text('medical_history'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_patients_nik').on(table.nik),
    index('idx_patients_rm').on(table.medicalRecordNumber),
    index('idx_patients_user_id').on(table.userId),
  ],
);

export const patientsRelations = relations(patients, ({ one, many }) => ({
  user: one(users, {
    fields: [patients.userId],
    references: [users.id],
  }),
  kunjungan: many(kunjunganPasien),
  rekamMedis: many(rekamMedisKunjungan),
}));

// =========================================================================
// 5. STAF, JADWAL, PRESENSI, & CUTI (MOBILE APP)
// =========================================================================

export const staffs = pgTable(
  'staffs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    poliklinikId: uuid('poliklinik_id')
      .notNull()
      .references(() => poliklinik.id, { onDelete: 'restrict' }),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    profession: varchar('profession', { length: 50 }).notNull(),
    idCardNumber: varchar('id_card_number', { length: 50 }).notNull().unique(),
    photoUrl: text('photo_url'),
    phoneNumber: varchar('phone_number', { length: 20 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_staffs_profession').on(table.profession),
    index('idx_staffs_poliklinik_id').on(table.poliklinikId),
  ],
);

export const staffsRelations = relations(staffs, ({ one, many }) => ({
  user: one(users, {
    fields: [staffs.userId],
    references: [users.id],
  }),
  poliklinik: one(poliklinik, {
    fields: [staffs.poliklinikId],
    references: [poliklinik.id],
  }),
  schedules: many(staffSchedules),
  attendances: many(staffAttendances),
  leaves: many(staffLeaves),
  kunjunganDilayani: many(kunjunganPasien),
  rekamMedisDiperiksa: many(rekamMedisKunjungan),
}));

export const staffSchedules = pgTable(
  'staff_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffs.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week'),
    specificDate: date('specific_date', { mode: 'string' }),
    session: appointmentSessionEnum('session').notNull(),
    isAvailable: boolean('is_available').default(true).notNull(),
    notes: varchar('notes', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('idx_schedules_staff_id').on(table.staffId)],
);

export const staffSchedulesRelations = relations(staffSchedules, ({ one }) => ({
  staff: one(staffs, {
    fields: [staffSchedules.staffId],
    references: [staffs.id],
  }),
}));

export const staffAttendances = pgTable(
  'staff_attendances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffs.id, { onDelete: 'cascade' }),
    scanTime: timestamp('scan_time', { withTimezone: true })
      .defaultNow()
      .notNull(),
    shift: attendanceShiftEnum('shift').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    deviceInfo: varchar('device_info', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_attendance_staff_date').on(table.staffId, table.scanTime),
  ],
);

export const staffAttendancesRelations = relations(
  staffAttendances,
  ({ one }) => ({
    staff: one(staffs, {
      fields: [staffAttendances.staffId],
      references: [staffs.id],
    }),
  }),
);

export const staffLeaves = pgTable(
  'staff_leaves',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffs.id, { onDelete: 'cascade' }),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
    documentUrl: text('document_url'),
    status: leaveStatusEnum('status').default('MENUNGGU_KONFIRMASI').notNull(),
    approvedBy: integer('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvalNotes: text('approval_notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('idx_leaves_staff_id').on(table.staffId)],
);

export const staffLeavesRelations = relations(staffLeaves, ({ one }) => ({
  staff: one(staffs, {
    fields: [staffLeaves.staffId],
    references: [staffs.id],
  }),
  approver: one(users, {
    fields: [staffLeaves.approvedBy],
    references: [users.id],
  }),
}));

// =========================================================================
// 6. ANTREAN & KUNJUNGAN PASIEN
// =========================================================================

export const kunjunganPasien = pgTable(
  'kunjungan_pasien',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    poliklinikId: uuid('poliklinik_id')
      .notNull()
      .references(() => poliklinik.id, { onDelete: 'restrict' }),
    layananId: uuid('layanan_id')
      .notNull()
      .references(() => layananPoli.id, { onDelete: 'restrict' }),
    staffId: uuid('staff_id').references(() => staffs.id, {
      onDelete: 'set null',
    }),
    appointmentDate: date('appointment_date', { mode: 'string' }).notNull(),
    session: appointmentSessionEnum('session').notNull(),
    queueNumber: varchar('queue_number', { length: 20 }).notNull(),
    status: appointmentStatusEnum('status')
      .default('SUDAH_BUAT_JANJI')
      .notNull(),
    visitType: visitTypeEnum('visit_type').default('Pemeriksaan Baru').notNull(),
    complaint: text('complaint'),
    calledAt: timestamp('called_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_kunjungan_antrean_harian').on(
      table.poliklinikId,
      table.appointmentDate,
      table.session,
      table.queueNumber,
    ),
    index('idx_kunjungan_status').on(table.status),
    index('idx_kunjungan_patient_id').on(table.patientId),
  ],
);

export const kunjunganPasienRelations = relations(
  kunjunganPasien,
  ({ one }) => ({
    patient: one(patients, {
      fields: [kunjunganPasien.patientId],
      references: [patients.id],
    }),
    poliklinik: one(poliklinik, {
      fields: [kunjunganPasien.poliklinikId],
      references: [poliklinik.id],
    }),
    layanan: one(layananPoli, {
      fields: [kunjunganPasien.layananId],
      references: [layananPoli.id],
    }),
    staff: one(staffs, {
      fields: [kunjunganPasien.staffId],
      references: [staffs.id],
    }),
    rekamMedis: one(rekamMedisKunjungan, {
      fields: [kunjunganPasien.id],
      references: [rekamMedisKunjungan.kunjunganId],
    }),
  }),
);

// =========================================================================
// 7. REKAM MEDIS & FORMULIR POLI UMUM / KIA
// =========================================================================

export const rekamMedisKunjungan = pgTable(
  'rekam_medis_kunjungan',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kunjunganId: uuid('kunjungan_id')
      .notNull()
      .unique()
      .references(() => kunjunganPasien.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'restrict' }),
    staffId: uuid('staff_id').references(() => staffs.id, {
      onDelete: 'set null',
    }),
    flowType: medicalFlowTypeEnum('flow_type').notNull(),

    // Field NIK Formulir Spesifik
    motherNik: varchar('mother_nik', { length: 16 }),
    partnerNik: varchar('partner_nik', { length: 16 }),
    childNik: varchar('child_nik', { length: 16 }),

    // Data Form Dinamis & Kalkulasi Otomatis
    formData: jsonb('form_data').default({}).notNull(),
    computedData: jsonb('computed_data').default({}).notNull(),

    // Hasil Pemeriksaan Dokter / Bidan
    diagnosis: text('diagnosis'),
    tindakan: text('tindakan'),
    resepObat: text('resep_obat'),
    catatanMedis: text('catatan_medis'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_rekam_medis_kunjungan_id').on(table.kunjunganId),
    index('idx_rekam_medis_patient_id').on(table.patientId),
    index('idx_rekam_medis_niks').on(
      table.motherNik,
      table.partnerNik,
      table.childNik,
    ),
  ],
);

export const rekamMedisKunjunganRelations = relations(
  rekamMedisKunjungan,
  ({ one }) => ({
    kunjungan: one(kunjunganPasien, {
      fields: [rekamMedisKunjungan.kunjunganId],
      references: [kunjunganPasien.id],
    }),
    patient: one(patients, {
      fields: [rekamMedisKunjungan.patientId],
      references: [patients.id],
    }),
    staff: one(staffs, {
      fields: [rekamMedisKunjungan.staffId],
      references: [staffs.id],
    }),
  }),
);

// Inferred Types
export type UserSelect = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type RoleSelect = typeof roles.$inferSelect;
export type StatusSelect = typeof statuses.$inferSelect;
export type FileSelect = typeof files.$inferSelect;
export type SessionSelect = typeof sessions.$inferSelect;
export type PoliklinikSelect = typeof poliklinik.$inferSelect;
export type LayananPoliSelect = typeof layananPoli.$inferSelect;
export type PatientSelect = typeof patients.$inferSelect;
export type StaffSelect = typeof staffs.$inferSelect;
export type StaffScheduleSelect = typeof staffSchedules.$inferSelect;
export type StaffAttendanceSelect = typeof staffAttendances.$inferSelect;
export type StaffLeaveSelect = typeof staffLeaves.$inferSelect;
export type KunjunganPasienSelect = typeof kunjunganPasien.$inferSelect;
export type RekamMedisKunjunganSelect = typeof rekamMedisKunjungan.$inferSelect;
