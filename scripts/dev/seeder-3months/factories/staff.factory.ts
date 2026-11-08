import type { PoolClient } from 'pg';
import type { DbContext, CreatedStaff } from '../types';
import { generateSecuredNik } from '../core/nik-helper';

const PASSWORD_HASH_SECRET123 =
  '$2b$10$Q6x.t9Z//m20ZPT.y7BmJO6qpWn4QRfrvn3gyVJqhBnjvIobs03HK'; // secret123

interface StaffPreset {
  userId: string;
  email: string;
  name: string;
  roleCode?: string; // Canonical role code matching roles.code (undefined if pure operational worker)
  unitCode: 'poli_umum' | 'poli_kia';
  staffCode: string;
  position: string;
  department: string;
  phone: string;
  birthDate: string; // YYYY-MM-DD
  gender: 'male' | 'female';
  practitioner?: {
    licenseNumber: string;
    specialtyCode: 'general_practitioner' | 'maternal_child_health';
    roomCode: 'r_pu_01' | 'r_pu_02' | 'r_kia_01' | 'r_kia_bersalin';
    sessionCodes: string[]; // e.g. ['pagi', 'sore']
    categoryCode: 'layanan_umum' | 'layanan_kia';
  };
}

export async function seedStaffAndPractitioners(
  client: PoolClient,
  ctx: DbContext
): Promise<CreatedStaff[]> {
  // CRITICAL INVARIANT: admin@amanah.com is the ONLY Administrator in the monorepo.
  // Practitioners and clinical units are dynamically mapped to canonical DB keys.
  const staffPresets: StaffPreset[] = [
    // 1. Single Administrator
    {
      userId: '13b174d6-c92a-4381-8e18-7b1d9e4e97e9',
      email: 'admin@amanah.com',
      name: 'Siti Administrator',
      roleCode: 'admin', // THE ONE AND ONLY ADMIN
      unitCode: 'poli_umum',
      staffCode: 'STF-ADM-001',
      position: 'Administrator Sistem & Operasional',
      department: 'Manajemen & IT',
      phone: '081211110001',
      birthDate: '1990-04-12',
      gender: 'female',
    },

    // 2. Dokter Poliklinik Umum
    {
      userId: '23b174d6-c92a-4381-8e18-7b1d9e4e97ea',
      email: 'zikrifadhiilahahmad@gmail.com',
      name: 'dr. Zikri Fadila Ahmad',
      roleCode: 'doctor',
      unitCode: 'poli_umum',
      staffCode: 'STF-DOK-001',
      position: 'Dokter Umum Penanggung Jawab',
      department: 'Poliklinik Rawat Jalan',
      phone: '081211110002',
      birthDate: '1992-08-23',
      gender: 'male',
      practitioner: {
        licenseNumber: 'SIP-503/001/IDI/2024',
        specialtyCode: 'general_practitioner',
        roomCode: 'r_pu_01',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_umum',
      },
    },
    {
      userId: '24b174d6-c92a-4381-8e18-7b1d9e4e97eb',
      email: 'dokter@amanah.com',
      name: 'dr. Budi Santoso',
      roleCode: 'doctor',
      unitCode: 'poli_umum',
      staffCode: 'STF-DOK-002',
      position: 'Dokter Umum Poliklinik',
      department: 'Poliklinik Rawat Jalan',
      phone: '081211110003',
      birthDate: '1987-11-15',
      gender: 'male',
      practitioner: {
        licenseNumber: 'SIP-503/002/IDI/2024',
        specialtyCode: 'general_practitioner',
        roomCode: 'r_pu_02',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_umum',
      },
    },
    {
      userId: '26b174d6-c92a-4381-8e18-7b1d9e4e97ed',
      email: 'dokter2@amanah.com',
      name: 'dr. Amanda Putri',
      roleCode: 'doctor',
      unitCode: 'poli_umum',
      staffCode: 'STF-DOK-003',
      position: 'Dokter Umum Pelaksana',
      department: 'Poliklinik Rawat Jalan',
      phone: '081211110013',
      birthDate: '1993-06-20',
      gender: 'female',
      practitioner: {
        licenseNumber: 'SIP-503/004/IDI/2024',
        specialtyCode: 'general_practitioner',
        roomCode: 'r_pu_01',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_umum',
      },
    },

    // 3. Praktisi Poli KIA & Spesialis
    {
      userId: '25b174d6-c92a-4381-8e18-7b1d9e4e97ec',
      email: 'spesialis@amanah.com',
      name: 'dr. Hendra Wijaya, Sp.OG',
      roleCode: 'doctor_specialist',
      unitCode: 'poli_kia',
      staffCode: 'STF-DOK-004',
      position: 'Dokter Spesialis Obstetri & Ginekologi',
      department: 'Poliklinik Spesialis Kandungan',
      phone: '081211110004',
      birthDate: '1983-05-19',
      gender: 'male',
      practitioner: {
        licenseNumber: 'SIP-503/003/POGI/2024',
        specialtyCode: 'maternal_child_health',
        roomCode: 'r_kia_01',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_kia',
      },
    },
    {
      userId: '33b174d6-c92a-4381-8e18-7b1d9e4e97ed',
      email: 'bidan@amanah.com',
      name: 'Bdn. Siti Rahma, S.Tr.Keb',
      roleCode: 'midwife_coordinator',
      unitCode: 'poli_kia',
      staffCode: 'STF-BID-001',
      position: 'Bidan Koordinator KIA',
      department: 'Pelayanan Kesehatan Ibu dan Anak',
      phone: '081211110005',
      birthDate: '1989-09-08',
      gender: 'female',
      practitioner: {
        licenseNumber: 'SIPB-503/001/IBI/2024',
        specialtyCode: 'maternal_child_health',
        roomCode: 'r_kia_01',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_kia',
      },
    },
    {
      userId: '34b174d6-c92a-4381-8e18-7b1d9e4e97ee',
      email: 'bidan2@amanah.com',
      name: 'Bdn. Nurul Aini, Amd.Keb',
      roleCode: 'midwife',
      unitCode: 'poli_kia',
      staffCode: 'STF-BID-002',
      position: 'Bidan Pelaksana KIA & KB',
      department: 'Pelayanan Kesehatan Ibu dan Anak',
      phone: '081211110006',
      birthDate: '1994-03-27',
      gender: 'female',
      practitioner: {
        licenseNumber: 'SIPB-503/002/IBI/2024',
        specialtyCode: 'maternal_child_health',
        roomCode: 'r_kia_01',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_kia',
      },
    },
    {
      userId: '35b174d6-c92a-4381-8e18-7b1d9e4e97ef',
      email: 'bidan3@amanah.com',
      name: 'Bdn. Ratna Dewi, S.Tr.Keb',
      roleCode: 'midwife',
      unitCode: 'poli_kia',
      staffCode: 'STF-BID-003',
      position: 'Bidan Pelaksana Persalinan & ANC',
      department: 'Pelayanan Kesehatan Ibu dan Anak',
      phone: '081211110014',
      birthDate: '1991-11-12',
      gender: 'female',
      practitioner: {
        licenseNumber: 'SIPB-503/003/IBI/2024',
        specialtyCode: 'maternal_child_health',
        roomCode: 'r_kia_bersalin',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_kia',
      },
    },

    // 4. Perawat (Praktisi Klinis Rawat Jalan & Tindakan)
    {
      userId: '41b174d6-c92a-4381-8e18-7b1d9e4e97ef',
      email: 'perawat1@amanah.com',
      name: 'Ns. Dimas Pratama, S.Kep',
      unitCode: 'poli_umum',
      staffCode: 'STF-PRW-001',
      position: 'Perawat Penanggung Jawab Rawat Jalan',
      department: 'Pelayanan Keperawatan',
      phone: '081211110007',
      birthDate: '1993-01-30',
      gender: 'male',
      practitioner: {
        licenseNumber: 'SIPP-503/001/PPNI/2024',
        specialtyCode: 'general_practitioner',
        roomCode: 'r_pu_01',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_umum',
      },
    },
    {
      userId: '42b174d6-c92a-4381-8e18-7b1d9e4e97f0',
      email: 'perawat2@amanah.com',
      name: 'Ns. Maya Safitri, S.Kep',
      unitCode: 'poli_umum',
      staffCode: 'STF-PRW-002',
      position: 'Perawat Triage & Tindakan Medis',
      department: 'Pelayanan Keperawatan',
      phone: '081211110008',
      birthDate: '1995-10-14',
      gender: 'female',
      practitioner: {
        licenseNumber: 'SIPP-503/002/PPNI/2024',
        specialtyCode: 'general_practitioner',
        roomCode: 'r_pu_02',
        sessionCodes: ['pagi', 'sore'],
        categoryCode: 'layanan_umum',
      },
    },

    // 5. Front Office & Customer Service
    {
      userId: '43b174d6-c92a-4381-8e18-7b1d9e4e97f1',
      email: 'cs@amanah.com',
      name: 'Rina Handayani',
      roleCode: 'customer_service',
      unitCode: 'poli_umum',
      staffCode: 'STF-CS-001',
      position: 'Front Office & Pendaftaran Pasien',
      department: 'Pelayanan Pelanggan',
      phone: '081211110009',
      birthDate: '1996-07-04',
      gender: 'female',
    },
    {
      userId: '44b174d6-c92a-4381-8e18-7b1d9e4e97f2',
      email: 'cs2@amanah.com',
      name: 'Dewi Anggraeni',
      roleCode: 'customer_service',
      unitCode: 'poli_kia',
      staffCode: 'STF-CS-002',
      position: 'Kasir & Informasi Pasien',
      department: 'Pelayanan Pelanggan',
      phone: '081211110010',
      birthDate: '1997-12-18',
      gender: 'female',
    },

    // 6. Manajemen Pendukung
    {
      userId: '51b174d6-c92a-4381-8e18-7b1d9e4e97f3',
      email: 'hr@amanah.com',
      name: 'Andi Kurniawan, S.Psi',
      unitCode: 'poli_umum',
      staffCode: 'STF-HRD-001',
      position: 'Kepala Bagian SDM & Presensi',
      department: 'Human Resources',
      phone: '081211110011',
      birthDate: '1988-02-22',
      gender: 'male',
    },
    {
      userId: '52b174d6-c92a-4381-8e18-7b1d9e4e97f4',
      email: 'finance@amanah.com',
      name: 'Farhan Hidayat, SE',
      unitCode: 'poli_umum',
      staffCode: 'STF-KEU-001',
      position: 'Manajer Keuangan & Payroll',
      department: 'Keuangan & Akuntansi',
      phone: '081211110012',
      birthDate: '1986-06-11',
      gender: 'male',
    },
  ];

  const createdList: CreatedStaff[] = [];
  let staffSeq = 1;

  for (const p of staffPresets) {
    // Dynamic role lookup strictly from database roles without fallback
    const role = p.roleCode ? ctx.roles.get(p.roleCode) : undefined;
    const roleId = role?.id || null;

    // Generate compliant NIK and cryptographic hashes
    const securedNik = generateSecuredNik(p.birthDate, p.gender, staffSeq++);

    // 1. Insert into users
    await client.query(
      `
      INSERT INTO users (id, name, email, phone, email_verified, phone_verified, status, preferred_locale, two_factor_enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, true, true, 'active', 'id-ID', false, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          status = 'active',
          updated_at = NOW();
      `,
      [p.userId, p.name, p.email, p.phone]
    );

    // 2. Insert into user_roles ONLY if role genuinely exists in roles table
    if (roleId) {
      await client.query(
        `
        INSERT INTO user_roles (user_id, role_id, assigned_at)
        VALUES ($1, $2, NOW() - INTERVAL '120 days')
        ON CONFLICT (user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;
        `,
        [p.userId, roleId]
      );
    }

    // 3. Insert into "user" (Better Auth)
    await client.query(
      `
      INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, true, $4, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          "updatedAt" = NOW();
      `,
      [p.userId, p.name, p.email, role?.code || 'worker']
    );

    // 4. Insert into "account" (Better Auth credential password)
    await client.query(
      `
      INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1::text, 'credential', $1::uuid, $2, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
      ON CONFLICT (id) DO NOTHING;
      `,
      [p.userId, PASSWORD_HASH_SECRET123]
    );

    // 5. Determine primary unit ID dynamically from DB
    const primaryUnit = ctx.units.get(p.unitCode) || ctx.units.values().next().value;
    const primaryUnitId = primaryUnit?.id || null;

    // 6. Insert into staff_profiles with valid NIK hashes
    const staffRes = await client.query(
      `
      INSERT INTO staff_profiles (
        user_id, staff_code, full_name, role_id, primary_unit_id,
        position_title, department_name, email, phone, status,
        birth_place, birth_date, gender, national_id_hash, national_id_encrypted,
        hired_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, 'active',
        'Kota Bandung', $10, $11, $12, $13,
        CURRENT_DATE - INTERVAL '120 days', NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days'
      )
      ON CONFLICT (user_id) DO UPDATE
      SET staff_code = EXCLUDED.staff_code,
          full_name = EXCLUDED.full_name,
          role_id = EXCLUDED.role_id,
          primary_unit_id = EXCLUDED.primary_unit_id,
          position_title = EXCLUDED.position_title,
          department_name = EXCLUDED.department_name,
          birth_place = EXCLUDED.birth_place,
          birth_date = EXCLUDED.birth_date,
          gender = EXCLUDED.gender,
          national_id_hash = EXCLUDED.national_id_hash,
          national_id_encrypted = EXCLUDED.national_id_encrypted,
          status = 'active',
          updated_at = NOW()
      RETURNING id;
      `,
      [
        p.userId,
        p.staffCode,
        p.name,
        roleId,
        primaryUnitId,
        p.position,
        p.department,
        p.email,
        p.phone,
        p.birthDate,
        p.gender,
        securedNik.blindIndex,
        securedNik.encrypted,
      ]
    );
    const staffProfileId = staffRes.rows[0].id;

    // 7. Insert KTP credential into staff_credentials
    await client.query(
      `
      INSERT INTO staff_credentials (
        staff_profile_id, credential_type, credential_number_hash, credential_number_encrypted,
        issuer, issued_at, expires_at, status, created_at, updated_at
      )
      VALUES ($1, 'national_id', $2, $3, 'Dinas Kependudukan dan Pencatatan Sipil', CURRENT_DATE - INTERVAL '5 years', NULL, 'verified', NOW(), NOW())
      ON CONFLICT DO NOTHING;
      `,
      [staffProfileId, securedNik.blindIndex, securedNik.encrypted]
    );

    let practitionerId: string | undefined;
    let defaultRoomId: string | undefined;
    let specialtyId: string | undefined;

    // 8. Insert practitioner & doctor assignment if clinical
    if (p.practitioner) {
      const pr = p.practitioner;
      const room = ctx.rooms.get(pr.roomCode) || ctx.rooms.values().next().value;
      const spec = ctx.specialties.get(pr.specialtyCode) || ctx.specialties.values().next().value;
      const cat = ctx.serviceCategories.get(pr.categoryCode) || ctx.serviceCategories.values().next().value;

      defaultRoomId = room?.id;
      specialtyId = spec?.id;
      const categoryId = cat?.id || null;

      const pracRes = await client.query(
        `
        INSERT INTO practitioners (
          staff_profile_id, specialty_id, default_room_id, display_name,
          license_number, is_accepting_appointments, consultation_duration_minutes, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, true, 20, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
        ON CONFLICT (staff_profile_id) DO UPDATE
        SET specialty_id = EXCLUDED.specialty_id,
            default_room_id = EXCLUDED.default_room_id,
            display_name = EXCLUDED.display_name,
            license_number = EXCLUDED.license_number,
            is_accepting_appointments = true,
            updated_at = NOW()
        RETURNING id;
        `,
        [staffProfileId, specialtyId || null, defaultRoomId || null, p.name, pr.licenseNumber]
      );
      practitionerId = pracRes.rows[0].id;

      // Doctor assignment across Monday-Saturday (dow 1 to 6)
      for (const sessionCode of pr.sessionCodes) {
        const sessionDef = ctx.sessions.get(sessionCode);
        if (sessionDef) {
          for (let dow = 1; dow <= 6; dow++) {
            await client.query(
              `
              INSERT INTO doctor_assignment (
                doctor_id, category_id, session_id, dow, preferred_room_id, is_active, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, true, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
              ON CONFLICT (doctor_id, session_id, dow) WHERE is_active = true DO UPDATE
              SET category_id = EXCLUDED.category_id,
                  preferred_room_id = EXCLUDED.preferred_room_id,
                  is_active = true,
                  updated_at = NOW();
              `,
              [practitionerId, categoryId, sessionDef.id, dow, defaultRoomId || null]
            );
          }
        }
      }
    }

    createdList.push({
      userId: p.userId,
      staffProfileId,
      practitionerId,
      roleCode: p.roleCode || 'worker',
      fullName: p.name,
      email: p.email,
      staffCode: p.staffCode,
      department: p.department,
      position: p.position,
      defaultRoomId,
      specialtyId,
    });
  }

  return createdList;
}
