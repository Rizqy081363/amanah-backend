#!/usr/bin/env bun
/**
 * Canonical Role, Hierarchy (Macro/Micro), and RBAC Seeder
 * Aligned with Migrations 0062, 0063, 0069, and 0071.
 *
 * Provisions:
 * 1. External Audience: patient (macro, default)
 * 2. Internal Audience:
 *    - Macro: admin, doctor, midwife, customer_service
 *    - Micro: doctor_specialist (child of doctor), midwife_coordinator (child of midwife)
 * 3. Granular permissions and application page access bindings.
 * 4. Baseline authentic users with role, staff/practitioner, and patient profile parity.
 * 5. Redis cache tag flushing.
 */

import {
  createDbPool,
  getRedisClient,
  invalidateRedisTagsAndPrefixes,
} from './purge/db-connection';
import { CLINICAL_MODULE_PACKS } from '../../src/modules/access-control/domain/constants/module-packs.constants';

interface SeedRole {
  code: string;
  name: string;
  description: string;
  audience: 'internal' | 'external';
  isClinical: boolean;
  isSystem: boolean;
  isDefault: boolean;
  permissionCodes: string[];
  pageSlugs: string[];
}

const PASSWORD_HASH_SECRET123 =
  '$2b$10$Q6x.t9Z//m20ZPT.y7BmJO6qpWn4QRfrvn3gyVJqhBnjvIobs03HK';

// Common pages for internal staff
const CLINICAL_INTERNAL_PAGES = [
  'admin.patient_care',
  'admin.patient_care.appointments',
  'admin.patient_care.patients',
  'admin.patient_care.chat',
  'admin.patient_care.medical_records',
  'admin.hr_management',
  'admin.hr_management.attendance',
  'admin.hr_management.leave',
  'admin.hr_management.replacement',
  'admin.finance',
  'admin.finance.payroll',
  'admin.system',
  'admin.system.profile',
  'admin.system.notifications',
];

const CS_INTERNAL_PAGES = [
  'admin.patient_care',
  'admin.patient_care.appointments',
  'admin.patient_care.patients',
  'admin.patient_care.chat',
  'admin.hr_management',
  'admin.hr_management.attendance',
  'admin.hr_management.leave',
  'admin.hr_management.replacement',
  'admin.finance',
  'admin.finance.payroll',
  'admin.system',
  'admin.system.profile',
  'admin.system.notifications',
];

const EXTERNAL_PATIENT_PAGES = [
  'external.patient_services',
  'external.patient_services.queue',
  'external.patient_services.appointments',
  'external.patient_services.history',
  'external.patient_services.chat',
  'external.patient_services.notifications',
  'external.patient_services.guide',
  'external.patient_services.profile',
  'external.patient_services.registration',
];

const CLINICAL_PERMISSIONS = Array.from(
  new Set([
    ...CLINICAL_MODULE_PACKS.general.manageCodes,
    ...CLINICAL_MODULE_PACKS.appointments.manageCodes,
    ...CLINICAL_MODULE_PACKS.queue.manageCodes,
    ...CLINICAL_MODULE_PACKS.records.manageCodes,
    ...CLINICAL_MODULE_PACKS.attendance.viewCodes,
    ...CLINICAL_MODULE_PACKS.payroll.viewCodes,
    ...CLINICAL_MODULE_PACKS.chat.manageCodes,
    ...CLINICAL_MODULE_PACKS.notifications.viewCodes,
  ]),
);

const CS_PERMISSIONS = Array.from(
  new Set([
    ...CLINICAL_MODULE_PACKS.general.manageCodes,
    ...CLINICAL_MODULE_PACKS.appointments.manageCodes,
    ...CLINICAL_MODULE_PACKS.queue.manageCodes,
    ...CLINICAL_MODULE_PACKS.patients.manageCodes,
    ...CLINICAL_MODULE_PACKS.attendance.viewCodes,
    ...CLINICAL_MODULE_PACKS.payroll.viewCodes,
    ...CLINICAL_MODULE_PACKS.chat.manageCodes,
    ...CLINICAL_MODULE_PACKS.notifications.manageCodes,
  ]),
);

const PATIENT_PERMISSIONS = [
  'app:access',
  'profile:read',
  'profile:update',
  'appointments:book',
  'appointments:read',
  'appointments:manage',
  'schedules:read',
  'queue:read',
  'chat:read',
  'chat:send',
  'notifications:read',
  'patients:register',
  'records:read',
];

// CANONICAL ROLES (Flat RBAC)
const ROLES: SeedRole[] = [
  {
    code: 'patient',
    name: 'Pasien',
    description: 'Pengguna layanan kesehatan dan pasien mandiri klinik',
    audience: 'external',
    isClinical: false,
    isSystem: false,
    isDefault: true,
    permissionCodes: PATIENT_PERMISSIONS,
    pageSlugs: EXTERNAL_PATIENT_PAGES,
  },
  {
    code: 'doctor',
    name: 'Dokter',
    description:
      'Tenaga medis klinis penanggung jawab konsultasi, pemeriksaan fisik, rekam medis, dan resep',
    audience: 'internal',
    isClinical: true,
    isSystem: false,
    isDefault: false,
    permissionCodes: CLINICAL_PERMISSIONS,
    pageSlugs: CLINICAL_INTERNAL_PAGES,
  },
  {
    code: 'doctor_specialist',
    name: 'Dokter Spesialis',
    description:
      'Dokter spesialis rujukan lanjutan (Sp.A, Sp.OG, Sp.PD, dll.) dengan kewenangan klinis khusus',
    audience: 'internal',
    isClinical: true,
    isSystem: false,
    isDefault: false,
    permissionCodes: CLINICAL_PERMISSIONS,
    pageSlugs: CLINICAL_INTERNAL_PAGES,
  },
  {
    code: 'midwife',
    name: 'Bidan',
    description:
      'Praktisi kebidanan pelayanan kesehatan ibu dan anak (KIA), persalinan, dan imunisasi',
    audience: 'internal',
    isClinical: true,
    isSystem: false,
    isDefault: false,
    permissionCodes: CLINICAL_PERMISSIONS,
    pageSlugs: CLINICAL_INTERNAL_PAGES,
  },
  {
    code: 'midwife_coordinator',
    name: 'Bidan Koordinator KIA',
    description:
      'Bidan senior penanggung jawab ruang bersalin, skrining ibu hamil berisiko tinggi, dan koordinasi bidan jaga',
    audience: 'internal',
    isClinical: true,
    isSystem: false,
    isDefault: false,
    permissionCodes: CLINICAL_PERMISSIONS,
    pageSlugs: CLINICAL_INTERNAL_PAGES,
  },
  {
    code: 'customer_service',
    name: 'Customer Service & Pendaftaran',
    description:
      'Staf front office pendaftaran pasien baru, panggilan tiket antrean, reservasi, dan informasi klinik',
    audience: 'internal',
    isClinical: false,
    isSystem: false,
    isDefault: false,
    permissionCodes: CS_PERMISSIONS,
    pageSlugs: CS_INTERNAL_PAGES,
  },
];

export async function seedRoles(): Promise<void> {
  console.log('================================================================================');
  console.log(' [Role & RBAC Seeder] Starting canonical role seeding...');
  console.log('================================================================================');

  const pool = createDbPool();
  const redis = await getRedisClient();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch available permissions catalog
    const permRes = await client.query('SELECT id, code FROM permissions;');
    const permMap = new Map<string, string>();
    for (const r of permRes.rows) {
      permMap.set(r.code, r.id);
    }
    console.log(`[1/5] Loaded ${permMap.size} permissions from catalog.`);

    // 2. Fetch available application pages catalog
    const pageRes = await client.query('SELECT id, slug FROM application_pages;');
    const pageMap = new Map<string, string>();
    for (const r of pageRes.rows) {
      pageMap.set(r.slug, r.id);
    }
    console.log(`[2/5] Loaded ${pageMap.size} application pages from registry.`);

    // Ensure Admin has all permissions and all internal pages
    const adminRes = await client.query("SELECT id FROM roles WHERE code = 'admin';");
    if (adminRes.rows.length > 0) {
      const adminRoleId = adminRes.rows[0].id;
      // All permissions
      for (const permId of permMap.values()) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id, created_at)
           VALUES ($1, $2, now())
           ON CONFLICT DO NOTHING;`,
          [adminRoleId, permId]
        );
      }
      // All internal pages
      const internalPageRes = await client.query(
        "SELECT id FROM application_pages WHERE audience = 'internal';"
      );
      for (const p of internalPageRes.rows) {
        await client.query(
          `INSERT INTO role_page_access (role_id, page_id, created_at)
           VALUES ($1, $2, now())
           ON CONFLICT (role_id, page_id) DO NOTHING;`,
          [adminRoleId, p.id]
        );
      }
      console.log('      [✓] Verified Administrator role with full permissions and internal pages.');
    }

    const roleMap = new Map<string, string>();
    if (adminRes.rows.length > 0) {
      roleMap.set('admin', adminRes.rows[0].id);
    }

    // 3. Upsert Canonical Roles
    console.log('\n[3/4] Upserting Canonical Roles (External & Internal)...');
    for (const r of ROLES) {
      const res = await client.query(
        `
        INSERT INTO roles (code, name, description, audience, is_clinical, is_system, is_default, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, now(), now())
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            audience = EXCLUDED.audience,
            is_clinical = EXCLUDED.is_clinical,
            is_default = EXCLUDED.is_default,
            is_active = true,
            updated_at = now()
        RETURNING id, code;
        `,
        [r.code, r.name, r.description, r.audience, r.isClinical, r.isSystem, r.isDefault]
      );
      const roleId = res.rows[0].id;
      roleMap.set(r.code, roleId);
      console.log(`      [✓] Role: ${r.name} [${r.code}] (Audience: ${r.audience}) -> ${roleId}`);

      // Bind & Sync Permissions (delete obsolete, insert current)
      const permIds = r.permissionCodes
        .map((pCode) => permMap.get(pCode))
        .filter((id): id is string => Boolean(id));

      if (permIds.length > 0) {
        await client.query(
          `DELETE FROM role_permissions WHERE role_id = $1 AND NOT (permission_id = ANY($2::uuid[]));`,
          [roleId, permIds]
        );
        for (const pId of permIds) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id, created_at)
             VALUES ($1, $2, now())
             ON CONFLICT DO NOTHING;`,
            [roleId, pId]
          );
        }
      }

      // Bind Pages
      for (const pSlug of r.pageSlugs) {
        const pId = pageMap.get(pSlug);
        if (pId) {
          await client.query(
            `INSERT INTO role_page_access (role_id, page_id, created_at)
             VALUES ($1, $2, now())
             ON CONFLICT (role_id, page_id) DO NOTHING;`,
            [roleId, pId]
          );
        }
      }
    }

    // 4. Seed Canonical Baseline Personas
    console.log('\n[4/4] Provisioning Baseline Personas (admin, doctor, midwife, cs, patient)...');

    // Look up units & rooms for staff links
    const unitPoliUmum = (
      await client.query("SELECT id FROM clinic_units WHERE code = 'poli_umum' LIMIT 1;")
    ).rows[0]?.id;
    const unitPoliKia = (
      await client.query("SELECT id FROM clinic_units WHERE code = 'poli_kia' LIMIT 1;")
    ).rows[0]?.id;

    const roomPoliUmum = (
      await client.query("SELECT id FROM clinic_rooms WHERE code = 'r_pu_01' LIMIT 1;")
    ).rows[0]?.id;
    const roomPoliKia = (
      await client.query("SELECT id FROM clinic_rooms WHERE code = 'r_kia_01' LIMIT 1;")
    ).rows[0]?.id;

    const specGeneral = (
      await client.query(
        "SELECT id FROM medical_specialties WHERE code = 'general_practitioner' LIMIT 1;"
      )
    ).rows[0]?.id;
    const specMch = (
      await client.query(
        "SELECT id FROM medical_specialties WHERE code = 'maternal_child_health' LIMIT 1;"
      )
    ).rows[0]?.id;

    interface Persona {
      userId: string;
      email: string;
      name: string;
      roleCode: string;
      staffProfile?: {
        code: string;
        fullName: string;
        position: string;
        department: string;
        primaryUnitId?: string | null;
        practitioner?: {
          displayName: string;
          specialtyId?: string | null;
          defaultRoomId?: string | null;
          licenseNumber: string;
        };
      };
      patientProfile?: {
        mrn: string;
        fullName: string;
        birthDate: string;
        gender: 'male' | 'female';
      };
    }

    const PERSONAS: Persona[] = [
      {
        userId: '23b174d6-c92a-4381-8e18-7b1d9e4e97ea',
        email: 'dokter@amanah.com',
        name: 'dr. Budi Santoso',
        roleCode: 'doctor',
        staffProfile: {
          code: 'STF-CLN-001',
          fullName: 'dr. Budi Santoso',
          position: 'Dokter Umum Penanggung Jawab',
          department: 'Poliklinik Rawat Jalan',
          primaryUnitId: unitPoliUmum || null,
          practitioner: {
            displayName: 'dr. Budi Santoso',
            specialtyId: specGeneral || null,
            defaultRoomId: roomPoliUmum || null,
            licenseNumber: 'SIP-503/001/IDI/2024',
          },
        },
      },
      {
        userId: '33b174d6-c92a-4381-8e18-7b1d9e4e97eb',
        email: 'bidan@amanah.com',
        name: 'Bdn. Siti Rahma, S.Tr.Keb',
        roleCode: 'midwife',
        staffProfile: {
          code: 'STF-CLN-002',
          fullName: 'Bdn. Siti Rahma, S.Tr.Keb',
          position: 'Bidan Koordinator KIA',
          department: 'Pelayanan Kesehatan Ibu dan Anak',
          primaryUnitId: unitPoliKia || null,
          practitioner: {
            displayName: 'Bdn. Siti Rahma, S.Tr.Keb',
            specialtyId: specMch || null,
            defaultRoomId: roomPoliKia || null,
            licenseNumber: 'SIPB-503/002/IBI/2024',
          },
        },
      },
      {
        userId: '43b174d6-c92a-4381-8e18-7b1d9e4e97ec',
        email: 'cs@amanah.com',
        name: 'Rina Handayani',
        roleCode: 'customer_service',
        staffProfile: {
          code: 'STF-ADM-001',
          fullName: 'Rina Handayani',
          position: 'Front Office & Pendaftaran Pasien',
          department: 'Pelayanan Pelanggan',
          primaryUnitId: unitPoliUmum || null,
        },
      },
      {
        userId: '53b174d6-c92a-4381-8e18-7b1d9e4e97ed',
        email: 'pasien@amanah.com',
        name: 'Ahmad Fauzi',
        roleCode: 'patient',
        patientProfile: {
          mrn: 'MRN-2026-0001',
          fullName: 'Ahmad Fauzi',
          birthDate: '1992-05-14',
          gender: 'male',
        },
      },
    ];

    for (const p of PERSONAS) {
      const roleId = roleMap.get(p.roleCode);
      if (!roleId) throw new Error(`Role '${p.roleCode}' not found for persona '${p.email}'`);

      // 1. users table
      await client.query(
        `
        INSERT INTO users (id, name, email, email_verified, phone_verified, status, preferred_locale, two_factor_enabled, created_at, updated_at)
        VALUES ($1, $2, $3, true, true, 'active', 'id-ID', false, now(), now())
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name, status = 'active', updated_at = now()
        RETURNING id;
        `,
        [p.userId, p.name, p.email]
      );

      // 2. auth_accounts table
      await client.query(
        `
        INSERT INTO auth_accounts (id, user_id, provider_id, account_id, password_hash, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, 'credential', $2, $3, now(), now())
        ON CONFLICT (provider_id, account_id) DO UPDATE
        SET password_hash = EXCLUDED.password_hash, updated_at = now();
        `,
        [p.userId, p.email, PASSWORD_HASH_SECRET123]
      );

      // 3. user_roles table
      await client.query(
        `
        INSERT INTO user_roles (id, user_id, role_id, assigned_at, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, now(), now(), now())
        ON CONFLICT (user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;
        `,
        [p.userId, roleId]
      );

      // 4. Better Auth user & account parity
      await client.query(
        `
        INSERT INTO "user" (id, name, email, "emailVerified", role, banned, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, true, $4, false, now(), now())
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name, role = EXCLUDED.role, "updatedAt" = now();
        `,
        [p.userId, p.name, p.email, p.roleCode]
      );

      // Clean up spurious trigger fallback 'patient' role for internal staff
      if (p.roleCode !== 'patient') {
        const patientRoleId = roleMap.get('patient');
        if (patientRoleId) {
          await client.query(
            `DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2;`,
            [p.userId, patientRoleId]
          );
        }
      }

      await client.query(
        `
        INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1::text, 'credential', $1::uuid, $2, now(), now())
        ON CONFLICT (id) DO NOTHING;
        `,
        [p.userId, PASSWORD_HASH_SECRET123]
      );

      // 5. Staff profile & Practitioner (if clinical/staff)
      if (p.staffProfile) {
        const sp = p.staffProfile;
        const staffRes = await client.query(
          `
          INSERT INTO staff_profiles (
            user_id, staff_code, full_name, role_id, primary_unit_id,
            position_title, department_name, email, status, hired_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', CURRENT_DATE, now(), now())
          ON CONFLICT (user_id) DO UPDATE
          SET staff_code = EXCLUDED.staff_code,
              full_name = EXCLUDED.full_name,
              role_id = EXCLUDED.role_id,
              primary_unit_id = EXCLUDED.primary_unit_id,
              position_title = EXCLUDED.position_title,
              department_name = EXCLUDED.department_name,
              status = 'active',
              updated_at = now()
          RETURNING id;
          `,
          [p.userId, sp.code, sp.fullName, roleId, sp.primaryUnitId, sp.position, sp.department, p.email]
        );
        const staffProfileId = staffRes.rows[0].id;

        if (sp.practitioner) {
          const pr = sp.practitioner;
          await client.query(
            `
            INSERT INTO practitioners (
              staff_profile_id, specialty_id, default_room_id, display_name,
              license_number, is_accepting_appointments, consultation_duration_minutes, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, true, 30, now(), now())
            ON CONFLICT (staff_profile_id) DO UPDATE
            SET specialty_id = EXCLUDED.specialty_id,
                default_room_id = EXCLUDED.default_room_id,
                display_name = EXCLUDED.display_name,
                license_number = EXCLUDED.license_number,
                is_accepting_appointments = true,
                updated_at = now();
            `,
            [staffProfileId, pr.specialtyId, pr.defaultRoomId, pr.displayName, pr.licenseNumber]
          );
        }
      }

      // 6. Patient profile (if patient)
      if (p.patientProfile) {
        const pat = p.patientProfile;
        const bloodTypeO = (
          await client.query("SELECT id FROM blood_types WHERE code = 'o' LIMIT 1;")
        ).rows[0]?.id;

        await client.query(
          `
          INSERT INTO patient_profiles (
            user_id, medical_record_number, full_name, email, birth_date,
            gender, blood_type_id, status, registered_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now(), now(), now())
          ON CONFLICT (medical_record_number) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              full_name = EXCLUDED.full_name,
              blood_type_id = EXCLUDED.blood_type_id,
              status = 'active',
              updated_at = now();
          `,
          [p.userId, pat.mrn, pat.fullName, p.email, pat.birthDate, pat.gender, bloodTypeO || null]
        );
      }

      console.log(`      [✓] Persona: ${p.name} <${p.email}> [Role: ${p.roleCode}]`);
    }

    await client.query('COMMIT');
    console.log('\n================================================================================');
    console.log('[✓] TRANSACTION COMMITTED SUCCESSFULLY!');
    console.log(`    - Roles Seeded       : ${ROLES.length}`);
    console.log(`    - Personas Seeded    : ${PERSONAS.length}`);
    console.log('================================================================================');

    // Invalidate Redis caches
    if (redis) {
      console.log('[Cache] Invalidating Redis role and auth caches...');
      await invalidateRedisTagsAndPrefixes(
        redis,
        ['roles', 'rbac', 'access-control', 'auth'],
        ['roles', 'user', 'session']
      );
      console.log('[Cache] Redis cache invalidated successfully.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[!] SEED FAILED — Transaction rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    if (redis) redis.disconnect();
  }
}

seedRoles().catch((err) => {
  console.error(err);
  process.exit(1);
});
