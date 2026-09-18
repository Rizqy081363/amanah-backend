import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {
  DEVELOPMENT_ROLE_SEEDS,
  DEVELOPMENT_USER_SEEDS,
} from './dev-seed.data';

type QueryOneInput = {
  client: PoolClient;
  text: string;
  values?: unknown[];
};

type SeedContext = {
  client: PoolClient;
  roleIdsByCode: Map<string, string>;
  userIdsByEmail: Map<string, string>;
  unitIdsByCode: Map<string, string>;
  specialtyIdsByCode: Map<string, string>;
  roomIdsByCode: Map<string, string>;
  serviceIdsByCode: Map<string, string>;
  staffIdsByCode: Map<string, string>;
  practitionerIdsByEmail: Map<string, string>;
  patientIdsByEmail: Map<string, string>;
};

const DEFAULT_POSTGRES_HOST_PORT = 5433;
const DEFAULT_DATABASE_MAX_POOL_SIZE = 5;
const DEVELOPMENT_PASSWORD = 'secret123';

const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DATABASE_HOST || 'localhost';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const port = isLocalHost
    ? (process.env.POSTGRES_HOST_PORT ||
        process.env.DATABASE_PORT ||
        String(DEFAULT_POSTGRES_HOST_PORT))
    : (process.env.DATABASE_PORT || '5432');
  const username = process.env.DATABASE_USERNAME || 'amanah';
  const password = process.env.DATABASE_PASSWORD || 'amanah_secret';
  const database = process.env.DATABASE_NAME || 'amanah_healthcare';

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
};

const queryOne = async <TRow extends QueryResultRow>({
  client,
  text,
  values = [],
}: QueryOneInput): Promise<TRow> => {
  const result = await client.query<TRow>(text, values);
  const row = result.rows[0];

  if (!row) {
    throw new Error(`Expected one row from seed query: ${text}`);
  }

  return row;
};

const queryOptional = async <TRow extends QueryResultRow>({
  client,
  text,
  values = [],
}: QueryOneInput): Promise<TRow | null> => {
  const result = await client.query<TRow>(text, values);

  return result.rows[0] ?? null;
};

const seedRoles = async (client: PoolClient): Promise<Map<string, string>> => {
  const roleIdsByCode = new Map<string, string>();

  for (const role of DEVELOPMENT_ROLE_SEEDS) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO roles (code, name, description, is_system)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            is_system = true,
            updated_at = now()
        RETURNING id
      `,
      values: [role.code, role.name, role.description],
    });
    roleIdsByCode.set(role.code, row.id);
  }

  return roleIdsByCode;
};

const seedPermissions = async (
  client: PoolClient,
  roleIdsByCode: Map<string, string>,
): Promise<void> => {
  const permissionCodes = [
    'app:access',
    'users:read',
    'users:manage',
    'patients:manage',
    'appointments:manage',
    'attendance:submit',
    'attendance:review',
    'support:manage',
  ];
  const permissionIdsByCode = new Map<string, string>();

  for (const code of permissionCodes) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO permissions (code, description)
        VALUES ($1, $2)
        ON CONFLICT (code) DO UPDATE
        SET description = EXCLUDED.description,
            updated_at = now()
        RETURNING id
      `,
      values: [code, `Development permission for ${code}`],
    });
    permissionIdsByCode.set(code, row.id);
  }

  const permissionsByRole = new Map<string, string[]>([
    ['admin', permissionCodes],
    [
      'staff_doctor',
      [
        'app:access',
        'patients:manage',
        'appointments:manage',
        'attendance:submit',
      ],
    ],
    [
      'staff_midwife',
      [
        'app:access',
        'patients:manage',
        'appointments:manage',
        'attendance:submit',
      ],
    ],
    ['staff_worker', ['app:access', 'attendance:review', 'support:manage']],
    ['patient', ['app:access']],
  ]);

  for (const [roleCode, rolePermissionCodes] of permissionsByRole) {
    const roleId = roleIdsByCode.get(roleCode);
    if (!roleId) {
      throw new Error(`Missing role seed for ${roleCode}`);
    }

    for (const permissionCode of rolePermissionCodes) {
      const permissionId = permissionIdsByCode.get(permissionCode);
      if (!permissionId) {
        throw new Error(`Missing permission seed for ${permissionCode}`);
      }

      await client.query(
        `
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [roleId, permissionId],
      );
    }
  }
};

const mapRoleCodeToBetterAuthRole = (roleCode: string): string => {
  switch (roleCode) {
    case 'admin':
      return 'admin';
    case 'staff_doctor':
      return 'staffDoctor';
    case 'staff_midwife':
      return 'staffMidwife';
    case 'staff_worker':
      return 'staffWorker';
    case 'patient':
      return 'patient';
    default:
      return 'patient';
  }
};

const seedUsers = async (
  client: PoolClient,
  roleIdsByCode: Map<string, string>,
): Promise<Map<string, string>> => {
  const userIdsByEmail = new Map<string, string>();
  const passwordHash = await bcrypt.hash(DEVELOPMENT_PASSWORD, 10);

  for (const user of DEVELOPMENT_USER_SEEDS) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO users (
          name,
          email,
          phone,
          email_verified,
          phone_verified,
          status,
          preferred_locale
        )
        VALUES ($1, $2, $3, true, true, 'active', 'id-ID')
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            email_verified = true,
            phone_verified = true,
            status = 'active',
            preferred_locale = 'id-ID',
            updated_at = now()
        RETURNING id
      `,
      values: [user.name, user.email, user.phone],
    });
    userIdsByEmail.set(user.email, row.id);

    await client.query(
      `
        INSERT INTO auth_accounts (user_id, provider_id, account_id, password_hash)
        VALUES ($1, 'credential', $2, $3)
        ON CONFLICT (provider_id, account_id) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            password_hash = EXCLUDED.password_hash,
            updated_at = now()
      `,
      [row.id, user.email, passwordHash],
    );

    const betterAuthRole = mapRoleCodeToBetterAuthRole(user.roleCode);
    const existingBetterAuthUser = await queryOptional<{ id: string }>({
      client,
      text: 'SELECT id FROM "user" WHERE email = $1',
      values: [user.email],
    });

    const betterAuthUserId = existingBetterAuthUser?.id ?? row.id;

    if (!existingBetterAuthUser) {
      await client.query(
        `
          INSERT INTO "user" (
            id,
            name,
            email,
            "emailVerified",
            role,
            banned,
            "createdAt",
            "updatedAt"
          )
          VALUES ($1, $2, $3, true, $4, false, now(), now())
        `,
        [row.id, user.name, user.email, betterAuthRole],
      );
    } else {
      await client.query(
        `
          UPDATE "user"
          SET name = $2,
              role = $3,
              "emailVerified" = true,
              banned = false,
              "updatedAt" = now()
          WHERE id = $1
        `,
        [existingBetterAuthUser.id, user.name, betterAuthRole],
      );
    }

    await client.query(
      `
        DELETE FROM account
        WHERE "userId" = $1 AND "providerId" = 'credential'
      `,
      [betterAuthUserId],
    );

    await client.query(
      `
        INSERT INTO account (
          id,
          "accountId",
          "providerId",
          "userId",
          password,
          "createdAt",
          "updatedAt"
        )
        VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())
      `,
      [betterAuthUserId, betterAuthUserId, passwordHash],
    );

    const roleId = roleIdsByCode.get(user.roleCode);
    if (!roleId) {
      throw new Error(`Missing role seed for ${user.roleCode}`);
    }

    await client.query(
      `
        INSERT INTO user_roles (user_id, role_id)
        SELECT $1, $2
        WHERE NOT EXISTS (
          SELECT 1
          FROM user_roles
          WHERE user_id = $1
            AND role_id = $2
            AND revoked_at IS NULL
        )
      `,
      [row.id, roleId],
    );
  }

  return userIdsByEmail;
};

const seedClinicCatalog = async (
  client: PoolClient,
): Promise<
  Pick<
    SeedContext,
    | 'unitIdsByCode'
    | 'specialtyIdsByCode'
    | 'roomIdsByCode'
    | 'serviceIdsByCode'
  >
> => {
  const existingClinic = await queryOptional<{ id: string }>({
    client,
    text: 'SELECT id FROM clinic_profiles LIMIT 1',
  });

  if (!existingClinic) {
    await client.query(`
      INSERT INTO clinic_profiles (
        name,
        short_name,
        legal_name,
        phone,
        whatsapp,
        email,
        website,
        address,
        region,
        emergency_notice
      )
      VALUES (
        'Klinik Amanah',
        'Amanah',
        'Klinik Amanah Healthcare',
        '022-555-0101',
        '6281200000101',
        'halo@amanah-healthcare.test',
        'https://amanah-healthcare.test',
        'Jl. Amanah Sehat No. 10, Bandung',
        'Bandung',
        'Hubungi IGD untuk kondisi darurat.'
      )
    `);
  }

  const units = [
    ['poli_umum', 'Poli Umum', 'polyclinic'],
    ['poli_kia', 'Poli KIA', 'polyclinic'],
    ['front_desk', 'Front Desk', 'department'],
    ['it_support', 'IT Support', 'support'],
  ] as const;
  const unitIdsByCode = new Map<string, string>();

  for (const [code, name, unitType] of units) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO clinic_units (code, name, unit_type, location, is_active)
        VALUES ($1, $2, $3, 'Gedung Utama', true)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            unit_type = EXCLUDED.unit_type,
            location = EXCLUDED.location,
            is_active = true,
            updated_at = now()
        RETURNING id
      `,
      values: [code, name, unitType],
    });
    unitIdsByCode.set(code, row.id);
  }

  const category = await queryOne<{ id: string }>({
    client,
    text: `
      INSERT INTO service_categories (code, name, description, display_order, is_active)
      VALUES ('clinical_services', 'Layanan Klinik', 'Layanan utama Klinik Amanah', 1, true)
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          display_order = EXCLUDED.display_order,
          is_active = true,
          updated_at = now()
      RETURNING id
    `,
  });

  const specialties = [
    ['general_practitioner', 'Dokter Umum'],
    ['maternal_child_health', 'Kesehatan Ibu dan Anak'],
  ] as const;
  const specialtyIdsByCode = new Map<string, string>();

  for (const [code, name] of specialties) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO medical_specialties (code, name, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            updated_at = now()
        RETURNING id
      `,
      values: [code, name, `Spesialisasi ${name}`],
    });
    specialtyIdsByCode.set(code, row.id);
  }

  const rooms = [
    ['room_umum_1', 'Ruang Poli Umum 1', 'poli_umum'],
    ['room_umum_2', 'Ruang Poli Umum 2', 'poli_umum'],
    ['room_kia_1', 'Ruang KIA 1', 'poli_kia'],
    ['room_kia_2', 'Ruang KIA 2', 'poli_kia'],
  ] as const;
  const roomIdsByCode = new Map<string, string>();

  for (const [code, name, unitCode] of rooms) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO clinic_rooms (unit_id, code, name, location, is_active)
        VALUES ($1, $2, $3, 'Gedung Utama', true)
        ON CONFLICT (code) DO UPDATE
        SET unit_id = EXCLUDED.unit_id,
            name = EXCLUDED.name,
            location = EXCLUDED.location,
            is_active = true,
            updated_at = now()
        RETURNING id
      `,
      values: [unitIdsByCode.get(unitCode), code, name],
    });
    roomIdsByCode.set(code, row.id);
  }

  const services = [
    ['general_checkup', 'Pemeriksaan Umum', 'UM', 'general_practitioner', null],
    [
      'doctor_consultation',
      'Konsultasi Dokter',
      'KD',
      'general_practitioner',
      null,
    ],
    [
      'pregnancy_checkup',
      'Pemeriksaan Kehamilan',
      'KIA',
      'maternal_child_health',
      'pregnancy',
    ],
    [
      'child_immunization',
      'Imunisasi Anak',
      'IM',
      'maternal_child_health',
      'immunization',
    ],
  ] as const;
  const serviceIdsByCode = new Map<string, string>();

  for (const [code, name, prefix, specialtyCode, medicalFlow] of services) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO clinic_services (
          service_category_id,
          specialty_id,
          code,
          name,
          short_name,
          code_prefix,
          medical_flow,
          display_order,
          is_bookable,
          is_active
        )
        VALUES ($1, $2, $3, $4, $4, $5, $6, 1, true, true)
        ON CONFLICT (code) DO UPDATE
        SET service_category_id = EXCLUDED.service_category_id,
            specialty_id = EXCLUDED.specialty_id,
            name = EXCLUDED.name,
            short_name = EXCLUDED.short_name,
            code_prefix = EXCLUDED.code_prefix,
            medical_flow = EXCLUDED.medical_flow,
            is_bookable = true,
            is_active = true,
            updated_at = now()
        RETURNING id
      `,
      values: [
        category.id,
        specialtyIdsByCode.get(specialtyCode),
        code,
        name,
        prefix,
        medicalFlow,
      ],
    });
    serviceIdsByCode.set(code, row.id);
  }

  return { unitIdsByCode, specialtyIdsByCode, roomIdsByCode, serviceIdsByCode };
};

const seedStaffProfiles = async (context: SeedContext): Promise<void> => {
  for (const user of DEVELOPMENT_USER_SEEDS.filter((seed) => seed.staff)) {
    const staff = user.staff;
    if (!staff) continue;

    const staffRow = await queryOne<{ id: string }>({
      client: context.client,
      text: `
        INSERT INTO staff_profiles (
          user_id,
          primary_unit_id,
          staff_code,
          full_name,
          staff_type,
          status,
          position_title,
          department_name,
          phone,
          email,
          hired_at
        )
        VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, '2024-01-02')
        ON CONFLICT (staff_code) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            primary_unit_id = EXCLUDED.primary_unit_id,
            full_name = EXCLUDED.full_name,
            staff_type = EXCLUDED.staff_type,
            status = 'active',
            position_title = EXCLUDED.position_title,
            department_name = EXCLUDED.department_name,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            updated_at = now()
        RETURNING id
      `,
      values: [
        context.userIdsByEmail.get(user.email),
        context.unitIdsByCode.get(staff.primaryUnitCode),
        staff.staffCode,
        user.name,
        staff.staffType,
        staff.positionTitle,
        staff.departmentName,
        user.phone,
        user.email,
      ],
    });
    context.staffIdsByCode.set(staff.staffCode, staffRow.id);

    if (!staff.practitioner) continue;

    const practitionerRow = await queryOne<{ id: string }>({
      client: context.client,
      text: `
        INSERT INTO practitioners (
          staff_profile_id,
          specialty_id,
          default_room_id,
          display_name,
          license_number,
          rating,
          tags,
          is_accepting_appointments
        )
        VALUES ($1, $2, $3, $4, $5, 4.80, ARRAY['ramah', 'berpengalaman'], true)
        ON CONFLICT (staff_profile_id) DO UPDATE
        SET specialty_id = EXCLUDED.specialty_id,
            default_room_id = EXCLUDED.default_room_id,
            display_name = EXCLUDED.display_name,
            license_number = EXCLUDED.license_number,
            rating = EXCLUDED.rating,
            tags = EXCLUDED.tags,
            is_accepting_appointments = true,
            updated_at = now()
        RETURNING id
      `,
      values: [
        staffRow.id,
        context.specialtyIdsByCode.get(staff.practitioner.specialtyCode),
        context.roomIdsByCode.get(staff.practitioner.defaultRoomCode),
        staff.practitioner.displayName,
        staff.practitioner.licenseNumber,
      ],
    });
    context.practitionerIdsByEmail.set(user.email, practitionerRow.id);
  }
};

const seedPatients = async (context: SeedContext): Promise<void> => {
  for (const user of DEVELOPMENT_USER_SEEDS.filter((seed) => seed.patient)) {
    const patient = user.patient;
    if (!patient) continue;

    const patientRow = await queryOne<{ id: string }>({
      client: context.client,
      text: `
        INSERT INTO patient_profiles (
          user_id,
          medical_record_number,
          national_id_encrypted,
          national_id_hash,
          full_name,
          birth_place,
          birth_date,
          gender,
          blood_type,
          phone,
          email,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unknown', $9, $10, 'active')
        ON CONFLICT (medical_record_number) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            national_id_encrypted = EXCLUDED.national_id_encrypted,
            national_id_hash = EXCLUDED.national_id_hash,
            full_name = EXCLUDED.full_name,
            birth_place = EXCLUDED.birth_place,
            birth_date = EXCLUDED.birth_date,
            gender = EXCLUDED.gender,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            status = 'active',
            updated_at = now()
        RETURNING id
      `,
      values: [
        context.userIdsByEmail.get(user.email),
        patient.medicalRecordNumber,
        patient.nationalId || null,
        patient.nationalId || null,
        patient.fullName,
        patient.birthPlace,
        patient.birthDate,
        patient.gender,
        patient.phone,
        user.email,
      ],
    });
    context.patientIdsByEmail.set(user.email, patientRow.id);

    await context.client.query(
      `
        INSERT INTO patient_addresses (
          patient_id,
          type,
          province_name,
          regency_name,
          line1,
          full_address,
          is_primary
        )
        SELECT $1, 'domicile', 'Jawa Barat', 'Bandung', $2, $3, true
        WHERE NOT EXISTS (
          SELECT 1
          FROM patient_addresses
          WHERE patient_id = $1
            AND type = 'domicile'
            AND is_primary
        )
      `,
      [patientRow.id, patient.addressLine, `${patient.addressLine}, Bandung`],
    );
  }
};

const firstValue = <TValue>(values: Iterable<TValue>): TValue => {
  const value = values[Symbol.iterator]().next().value as TValue | undefined;
  if (!value) {
    throw new Error('Expected at least one seeded value');
  }

  return value;
};

const seedOperationalExamples = async (context: SeedContext): Promise<void> => {
  const generalServiceId = context.serviceIdsByCode.get('general_checkup');
  const firstPatientId = firstValue(context.patientIdsByEmail.values());
  const firstDoctorId = firstValue(context.practitionerIdsByEmail.values());
  const firstRoomId = context.roomIdsByCode.get('room_umum_1');

  if (!generalServiceId || !firstRoomId) {
    throw new Error('Missing catalog seed required for operational examples');
  }

  const schedule = await queryOne<{ id: string }>({
    client: context.client,
    text: `
      INSERT INTO practitioner_schedule_sessions (
        practitioner_id,
        service_id,
        room_id,
        schedule_date,
        session_label,
        session_shift,
        start_time,
        end_time,
        capacity,
        available_slots,
        status
      )
      VALUES ($1, $2, $3, current_date + 1, 'Pagi', 'morning', '08:00', '12:00', 20, 18, 'open')
      ON CONFLICT (practitioner_id, schedule_date, start_time) DO UPDATE
      SET service_id = EXCLUDED.service_id,
          room_id = EXCLUDED.room_id,
          session_label = EXCLUDED.session_label,
          session_shift = EXCLUDED.session_shift,
          end_time = EXCLUDED.end_time,
          capacity = EXCLUDED.capacity,
          available_slots = EXCLUDED.available_slots,
          status = 'open',
          updated_at = now()
      RETURNING id
    `,
    values: [firstDoctorId, generalServiceId, firstRoomId],
  });

  const appointment = await queryOne<{ id: string }>({
    client: context.client,
    text: `
      INSERT INTO appointments (
        booking_code,
        patient_id,
        practitioner_id,
        schedule_session_id,
        service_id,
        room_id,
        visit_type,
        status,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        complaint
      )
      VALUES (
        'BOOK-DEV-0001',
        $1,
        $2,
        $3,
        $4,
        $5,
        'new_visit',
        'booked',
        current_date + 1,
        '08:30',
        '09:00',
        'Demam ringan dan batuk sejak dua hari'
      )
      ON CONFLICT (booking_code) DO UPDATE
      SET patient_id = EXCLUDED.patient_id,
          practitioner_id = EXCLUDED.practitioner_id,
          schedule_session_id = EXCLUDED.schedule_session_id,
          service_id = EXCLUDED.service_id,
          room_id = EXCLUDED.room_id,
          status = 'booked',
          scheduled_date = EXCLUDED.scheduled_date,
          scheduled_start_time = EXCLUDED.scheduled_start_time,
          scheduled_end_time = EXCLUDED.scheduled_end_time,
          complaint = EXCLUDED.complaint,
          updated_at = now()
      RETURNING id
    `,
    values: [
      firstPatientId,
      firstDoctorId,
      schedule.id,
      generalServiceId,
      firstRoomId,
    ],
  });

  await context.client.query(
    `
      INSERT INTO queue_tickets (
        appointment_id,
        service_id,
        room_id,
        queue_date,
        queue_number,
        priority,
        status,
        waiting_position
      )
      VALUES ($1, $2, $3, current_date + 1, 'UM-001', 'regular', 'waiting', 1)
      ON CONFLICT (appointment_id) DO UPDATE
      SET service_id = EXCLUDED.service_id,
          room_id = EXCLUDED.room_id,
          queue_date = EXCLUDED.queue_date,
          queue_number = EXCLUDED.queue_number,
          priority = EXCLUDED.priority,
          status = EXCLUDED.status,
          waiting_position = EXCLUDED.waiting_position,
          updated_at = now()
    `,
    [appointment.id, generalServiceId, firstRoomId],
  );

  await context.client.query(
    `
      INSERT INTO appointment_status_events (appointment_id, new_status, reason)
      SELECT $1, 'booked', 'Development seed booking created'
      WHERE NOT EXISTS (
        SELECT 1
        FROM appointment_status_events
        WHERE appointment_id = $1
          AND new_status = 'booked'
      )
    `,
    [appointment.id],
  );

  // 1. Seed Additional Appointments & Clinical Encounters for Analytics & Mobile
  const aptTodayCompleted = await queryOne<{ id: string }>({
    client: context.client,
    text: `
      INSERT INTO appointments (
        booking_code,
        patient_id,
        practitioner_id,
        service_id,
        room_id,
        visit_type,
        status,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        complaint
      )
      VALUES (
        'BOOK-DEV-TODAY-01',
        $1, $2, $3, $4,
        'new_visit',
        'completed',
        current_date,
        '09:00',
        '09:30',
        'Pemeriksaan dan kontrol tensi rutin'
      )
      ON CONFLICT (booking_code) DO UPDATE
      SET status = 'completed',
          updated_at = now()
      RETURNING id
    `,
    values: [firstPatientId, firstDoctorId, generalServiceId, firstRoomId],
  });

  await context.client.query(
    `
      INSERT INTO queue_tickets (
        appointment_id,
        service_id,
        room_id,
        queue_date,
        queue_number,
        priority,
        status,
        waiting_position
      )
      VALUES ($1, $2, $3, current_date, 'UM-002', 'regular', 'completed', null)
      ON CONFLICT (appointment_id) DO UPDATE
      SET status = 'completed',
          updated_at = now()
    `,
    [aptTodayCompleted.id, generalServiceId, firstRoomId],
  );

  await context.client.query(
    `
      INSERT INTO clinical_encounters (
        appointment_id,
        patient_id,
        practitioner_id,
        service_id,
        encounter_date,
        status,
        subjective_notes,
        objective_notes,
        assessment,
        plan
      )
      SELECT $1, $2, $3, $4, current_date, 'completed',
             'Pasien merasa fit, tidak ada pusing atau mual.',
             'Tensi 120/80 mmHg, Nadi 78x/m, Suhu 36.6 C.',
             'Pemeriksaan kesehatan umum dalam batas normal.',
             'Edukasi pertahankan pola makan sehat dan hidrasi cukup.'
      WHERE NOT EXISTS (
        SELECT 1 FROM clinical_encounters WHERE appointment_id = $1
      )
    `,
    [aptTodayCompleted.id, firstPatientId, firstDoctorId, generalServiceId],
  );

  const aptTodayWaiting = await queryOne<{ id: string }>({
    client: context.client,
    text: `
      INSERT INTO appointments (
        booking_code,
        patient_id,
        practitioner_id,
        service_id,
        room_id,
        visit_type,
        status,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        complaint
      )
      VALUES (
        'BOOK-DEV-TODAY-02',
        $1, $2, $3, $4,
        'new_visit',
        'waiting',
        current_date,
        '10:30',
        '11:00',
        'Batuk kering dan tenggorokan gatal sejak 3 hari'
      )
      ON CONFLICT (booking_code) DO UPDATE
      SET status = 'waiting',
          updated_at = now()
      RETURNING id
    `,
    values: [firstPatientId, firstDoctorId, generalServiceId, firstRoomId],
  });

  await context.client.query(
    `
      INSERT INTO queue_tickets (
        appointment_id,
        service_id,
        room_id,
        queue_date,
        queue_number,
        priority,
        status,
        waiting_position
      )
      VALUES ($1, $2, $3, current_date, 'UM-003', 'regular', 'waiting', 1)
      ON CONFLICT (appointment_id) DO UPDATE
      SET status = 'waiting',
          updated_at = now()
    `,
    [aptTodayWaiting.id, generalServiceId, firstRoomId],
  );

  // Past appointments for monthly analytics
  await context.client.query(
    `
      INSERT INTO appointments (
        booking_code,
        patient_id,
        practitioner_id,
        service_id,
        room_id,
        visit_type,
        status,
        scheduled_date,
        scheduled_start_time,
        scheduled_end_time,
        complaint
      )
      VALUES (
        'BOOK-DEV-YEST-01',
        $1, $2, $3, $4,
        'new_visit',
        'completed',
        current_date - 1,
        '09:00',
        '09:30',
        'Pusing berputar bila bangun tidur'
      )
      ON CONFLICT (booking_code) DO UPDATE
      SET status = 'completed',
          updated_at = now()
    `,
    [firstPatientId, firstDoctorId, generalServiceId, firstRoomId],
  );

  // 2. Seed Staff Attendance Records
  const doctorStaffId = context.staffIdsByCode.get('DOC-AMANAH-001');
  const midwifeStaffId = context.staffIdsByCode.get('BDN-AMANAH-001');

  if (doctorStaffId) {
    await context.client.query(
      `
        INSERT INTO staff_attendance_records (
          staff_profile_id,
          attendance_date,
          shift,
          status,
          check_in_at,
          recorded_method,
          location_label
        )
        SELECT $1, current_date, 'morning', 'present',
               now() - interval '4 hours', 'qr_scan', 'Poli Umum Gedung Utama'
        WHERE NOT EXISTS (
          SELECT 1 FROM staff_attendance_records
          WHERE staff_profile_id = $1 AND attendance_date = current_date
        )
      `,
      [doctorStaffId],
    );

    await context.client.query(
      `
        INSERT INTO staff_attendance_records (
          staff_profile_id,
          attendance_date,
          shift,
          status,
          check_in_at,
          check_out_at,
          recorded_method,
          location_label
        )
        SELECT $1, current_date - 1, 'morning', 'present',
               (current_date - 1) + time '07:50:00',
               (current_date - 1) + time '16:10:00',
               'qr_scan', 'Poli Umum Gedung Utama'
        WHERE NOT EXISTS (
          SELECT 1 FROM staff_attendance_records
          WHERE staff_profile_id = $1 AND attendance_date = current_date - 1
        )
      `,
      [doctorStaffId],
    );

    await context.client.query(
      `
        INSERT INTO staff_attendance_records (
          staff_profile_id,
          attendance_date,
          shift,
          status,
          check_in_at,
          check_out_at,
          late_minutes,
          recorded_method,
          location_label
        )
        SELECT $1, current_date - 2, 'morning', 'late',
               (current_date - 2) + time '08:15:00',
               (current_date - 2) + time '16:00:00',
               15, 'qr_scan', 'Poli Umum Gedung Utama'
        WHERE NOT EXISTS (
          SELECT 1 FROM staff_attendance_records
          WHERE staff_profile_id = $1 AND attendance_date = current_date - 2
        )
      `,
      [doctorStaffId],
    );
  }

  if (midwifeStaffId) {
    await context.client.query(
      `
        INSERT INTO staff_attendance_records (
          staff_profile_id,
          attendance_date,
          shift,
          status,
          check_in_at,
          recorded_method,
          location_label
        )
        SELECT $1, current_date, 'morning', 'present',
               now() - interval '3 hours', 'qr_scan', 'Poli KIA Gedung Utama'
        WHERE NOT EXISTS (
          SELECT 1 FROM staff_attendance_records
          WHERE staff_profile_id = $1 AND attendance_date = current_date
        )
      `,
      [midwifeStaffId],
    );
  }

  // 3. Seed Staff Leaves
  const adminUserId = context.userIdsByEmail.get('admin@amanah.com');
  if (doctorStaffId) {
    await context.client.query(
      `
        INSERT INTO staff_leave_requests (
          staff_profile_id,
          request_type,
          start_date,
          end_date,
          duration_days,
          reason,
          status
        )
        SELECT $1, 'seminar_symposium', current_date + 7, current_date + 8, 2,
               'Simposium Dokter Spesialis IDI Wilayah Jawa Barat', 'pending'
        WHERE NOT EXISTS (
          SELECT 1 FROM staff_leave_requests
          WHERE staff_profile_id = $1 AND reason = 'Simposium Dokter Spesialis IDI Wilayah Jawa Barat'
        )
      `,
      [doctorStaffId],
    );

    await context.client.query(
      `
        INSERT INTO staff_leave_requests (
          staff_profile_id,
          request_type,
          start_date,
          end_date,
          duration_days,
          reason,
          status,
          reviewed_by,
          reviewed_at,
          reviewer_notes
        )
        SELECT $1, 'annual_leave', current_date - 20, current_date - 18, 3,
               'Cuti tahunan keperluan keluarga', 'approved', $2, now() - interval '25 days',
               'Disetujui. Tugas didelegasikan ke dokter pengganti.'
        WHERE NOT EXISTS (
          SELECT 1 FROM staff_leave_requests
          WHERE staff_profile_id = $1 AND reason = 'Cuti tahunan keperluan keluarga'
        )
      `,
      [doctorStaffId, adminUserId],
    );

    await context.client.query(
      `
        INSERT INTO staff_leave_requests (
          staff_profile_id,
          request_type,
          start_date,
          end_date,
          duration_days,
          reason,
          status,
          cancelled_at
        )
        SELECT $1, 'family_matter', current_date - 5, current_date - 4, 2,
               'Izin acara syukuran keluarga', 'cancelled', now() - interval '6 days'
        WHERE NOT EXISTS (
          SELECT 1 FROM staff_leave_requests
          WHERE staff_profile_id = $1 AND reason = 'Izin acara syukuran keluarga'
        )
      `,
      [doctorStaffId],
    );
  }

  // 4. Seed Notifications & Recipients & Actions
  const doctorUserId = context.userIdsByEmail.get('dokter@amanah.com');
  const patientUserId = context.userIdsByEmail.get('pasien@amanah.com');

  const seedNotification = async (notifData: {
    category: string;
    title: string;
    body: string;
    isUrgent: boolean;
    visualKey?: string;
    userId: string;
    isRead: boolean;
    actions?: Array<{
      label: string;
      actionKey: string;
      actionType: string;
      url?: string;
    }>;
  }) => {
    let notifRow = await queryOptional<{ id: string }>({
      client: context.client,
      text: 'SELECT id FROM notifications WHERE title = $1 AND body = $2 LIMIT 1',
      values: [notifData.title, notifData.body],
    });

    if (!notifRow) {
      notifRow = await queryOne<{ id: string }>({
        client: context.client,
        text: `
          INSERT INTO notifications (category, title, body, is_urgent, visual_key, created_by)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
        values: [
          notifData.category,
          notifData.title,
          notifData.body,
          notifData.isUrgent,
          notifData.visualKey || null,
          adminUserId,
        ],
      });
    }

    await context.client.query(
      `
        INSERT INTO notification_recipients (notification_id, user_id, delivered_at, read_at)
        VALUES ($1, $2, now(), $3)
        ON CONFLICT (notification_id, user_id) DO UPDATE
        SET delivered_at = EXCLUDED.delivered_at
      `,
      [
        notifRow.id,
        notifData.userId,
        notifData.isRead ? new Date().toISOString() : null,
      ],
    );

    if (notifData.actions) {
      for (const act of notifData.actions) {
        await context.client.query(
          `
            INSERT INTO notification_actions (notification_id, label, action_key, action_type, url)
            SELECT $1, $2, $3, $4, $5
            WHERE NOT EXISTS (
              SELECT 1 FROM notification_actions
              WHERE notification_id = $1 AND action_key = $3
            )
          `,
          [
            notifRow.id,
            act.label,
            act.actionKey,
            act.actionType,
            act.url || null,
          ],
        );
      }
    }
  };

  if (doctorUserId) {
    await seedNotification({
      category: 'shift',
      title: 'Jadwal Praktik Poli Umum Ditugaskan',
      body: 'Jadwal praktik Poli Umum Anda untuk esok hari pukul 08:00 - 12:00 WIB telah aktif.',
      isUrgent: false,
      visualKey: 'calendar',
      userId: doctorUserId,
      isRead: false,
      actions: [
        {
          label: 'Lihat Jadwal',
          actionKey: 'view_schedule',
          actionType: 'primary',
          url: '/schedules',
        },
      ],
    });

    await seedNotification({
      category: 'clinical',
      title: 'Hasil Lab Pasien Selesai',
      body: 'Hasil uji laboratorium darah lengkap pasien Dewi Lestari (RM-2026-0001) telah siap ditinjau.',
      isUrgent: true,
      visualKey: 'flask',
      userId: doctorUserId,
      isRead: false,
      actions: [
        {
          label: 'Buka Rekam Medis',
          actionKey: 'view_mr',
          actionType: 'secondary',
          url: '/medical-records',
        },
      ],
    });

    await seedNotification({
      category: 'system',
      title: 'Kebijakan Presensi Mobile',
      body: 'Sistem presensi GPS dan scan QR telah diperbarui ke versi standar 2026.',
      isUrgent: false,
      visualKey: 'info',
      userId: doctorUserId,
      isRead: true,
    });
  }

  if (patientUserId) {
    await seedNotification({
      category: 'appointment',
      title: 'Antrean Poliklinik Anda Siap',
      body: 'Nomor antrean UM-001 Anda pada Poli Umum diperkirakan dipanggil dalam 15 menit.',
      isUrgent: true,
      visualKey: 'bell',
      userId: patientUserId,
      isRead: false,
      actions: [
        {
          label: 'Lihat Antrean',
          actionKey: 'view_queue',
          actionType: 'primary',
        },
      ],
    });
  }

  // 5. Seed Support Tickets & Messages
  const seedTicket = async (ticketData: {
    ticketNumber: string;
    reporterUserId: string;
    assignedStaffId?: string | null;
    title: string;
    description: string;
    status: string;
    priority: string;
    messages: Array<{
      senderUserId?: string | null;
      senderType: 'reporter' | 'support_agent' | 'system';
      body: string;
    }>;
  }) => {
    const ticketRow = await queryOne<{ id: string }>({
      client: context.client,
      text: `
        INSERT INTO support_tickets (
          ticket_number,
          reporter_user_id,
          assigned_staff_id,
          title,
          description,
          status,
          priority
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (ticket_number) DO UPDATE
        SET status = EXCLUDED.status,
            priority = EXCLUDED.priority,
            updated_at = now()
        RETURNING id
      `,
      values: [
        ticketData.ticketNumber,
        ticketData.reporterUserId,
        ticketData.assignedStaffId || null,
        ticketData.title,
        ticketData.description,
        ticketData.status,
        ticketData.priority,
      ],
    });

    for (const msg of ticketData.messages) {
      await context.client.query(
        `
          INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_type, body)
          SELECT $1, $2, $3, $4
          WHERE NOT EXISTS (
            SELECT 1 FROM support_ticket_messages
            WHERE ticket_id = $1 AND body = $4
          )
        `,
        [ticketRow.id, msg.senderUserId || null, msg.senderType, msg.body],
      );
    }
  };

  if (doctorUserId) {
    await seedTicket({
      ticketNumber: 'TK-2026-0001',
      reporterUserId: doctorUserId,
      assignedStaffId: doctorStaffId,
      title: 'Scanner QR Meja Poli Umum 1 Lambat',
      description:
        'Tablet poli membutuhkan waktu lama saat memindai QR presensi staf.',
      status: 'open',
      priority: 'high',
      messages: [
        {
          senderUserId: doctorUserId,
          senderType: 'reporter',
          body: 'Tablet poli membutuhkan waktu lama saat memindai QR presensi staf.',
        },
        {
          senderUserId: adminUserId,
          senderType: 'support_agent',
          body: 'Baik Dok, tim IT sedang memeriksa firmware dan koneksi jaringan tablet Poli Umum 1.',
        },
      ],
    });
  }

  if (patientUserId) {
    await seedTicket({
      ticketNumber: 'TK-2026-0002',
      reporterUserId: patientUserId,
      title: 'Pembayaran Non-Tunai QRIS Farmasi',
      description:
        'Apakah kasir farmasi menerima pembayaran obat menggunakan QRIS?',
      status: 'resolved',
      priority: 'normal',
      messages: [
        {
          senderUserId: patientUserId,
          senderType: 'reporter',
          body: 'Apakah kasir farmasi menerima pembayaran obat menggunakan QRIS?',
        },
        {
          senderUserId: adminUserId,
          senderType: 'support_agent',
          body: 'Bisa Bu Dewi, kasir farmasi menerima seluruh QRIS bank dan dompet digital.',
        },
      ],
    });
  }
};

const createSeedContext = async (client: PoolClient): Promise<SeedContext> => {
  const roleIdsByCode = await seedRoles(client);
  await seedPermissions(client, roleIdsByCode);
  const userIdsByEmail = await seedUsers(client, roleIdsByCode);
  const catalog = await seedClinicCatalog(client);

  return {
    client,
    roleIdsByCode,
    userIdsByEmail,
    ...catalog,
    staffIdsByCode: new Map<string, string>(),
    practitionerIdsByEmail: new Map<string, string>(),
    patientIdsByEmail: new Map<string, string>(),
  };
};

const runSeed = async (): Promise<void> => {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: DEFAULT_DATABASE_MAX_POOL_SIZE,
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const context = await createSeedContext(client);
    await seedStaffProfiles(context);
    await seedPatients(context);
    await seedOperationalExamples(context);
    await client.query('COMMIT');
    console.log(`Seeded ${DEVELOPMENT_USER_SEEDS.length} development users.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

runSeed().catch((error) => {
  console.error('Development seed failed:', error);
  process.exit(1);
});
