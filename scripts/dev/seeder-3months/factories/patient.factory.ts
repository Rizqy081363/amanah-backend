import type { PoolClient } from 'pg';
import type { DbContext, CreatedPatient } from '../types';
import { generateSecuredNik } from '../core/nik-helper';

const PASSWORD_HASH_SECRET123 =
  '$2b$10$Q6x.t9Z//m20ZPT.y7BmJO6qpWn4QRfrvn3gyVJqhBnjvIobs03HK'; // secret123

interface FamilyMemberDef {
  fullName: string;
  relationCode: 'self' | 'spouse' | 'child' | 'parent';
  gender: 'male' | 'female';
  birthDate: string;
  bloodTypeCode: string;
  relationLabel: string;
}

interface FamilyGroupDef {
  headEmail: string;
  headName: string;
  phone: string;
  address: string;
  district: string;
  members: FamilyMemberDef[];
}

export async function seedPatientsAndAffiliations(
  client: PoolClient,
  ctx: DbContext
): Promise<CreatedPatient[]> {
  const patientRole = ctx.roles.get('patient') || ctx.roles.values().next().value;
  const relSelf = ctx.relationshipTypes.get('self') || ctx.relationshipTypes.values().next().value;
  const relSpouse = ctx.relationshipTypes.get('spouse') || relSelf;
  const relChild = ctx.relationshipTypes.get('child') || relSelf;
  const relParent = ctx.relationshipTypes.get('parent') || relSelf;

  const bloodO = ctx.bloodTypes.get('o')?.id;
  const bloodA = ctx.bloodTypes.get('a')?.id;
  const bloodB = ctx.bloodTypes.get('b')?.id;
  const bloodAB = ctx.bloodTypes.get('ab')?.id;
  const bloodMap: Record<string, string | undefined> = {
    o: bloodO,
    a: bloodA,
    b: bloodB,
    ab: bloodAB,
  };

  const FAMILIES: FamilyGroupDef[] = [
    {
      headEmail: 'pasien@amanah.com',
      headName: 'Ahmad Fauzi',
      phone: '081320000001',
      address: 'Jl. Gegerkalong Hilir No. 45 RT 02/RW 03',
      district: 'Sukasari',
      members: [
        { fullName: 'Ahmad Fauzi', relationCode: 'self', gender: 'male', birthDate: '1992-05-14', bloodTypeCode: 'o', relationLabel: 'Diri Sendiri' },
        { fullName: 'Siti Nurhaliza', relationCode: 'spouse', gender: 'female', birthDate: '1994-08-20', bloodTypeCode: 'a', relationLabel: 'Istri' },
        { fullName: 'Rayyan Fauzi', relationCode: 'child', gender: 'male', birthDate: '2024-02-10', bloodTypeCode: 'o', relationLabel: 'Anak Pertama (Balita)' },
        { fullName: 'Zahra Fauzi', relationCode: 'child', gender: 'female', birthDate: '2019-11-05', bloodTypeCode: 'a', relationLabel: 'Anak Kedua' },
      ],
    },
    {
      headEmail: 'rizky.ramadhan@gmail.com',
      headName: 'Rizky Ramadhan',
      phone: '081320000002',
      address: 'Jl. Sukajadi No. 128 RT 04/RW 01',
      district: 'Sukajadi',
      members: [
        { fullName: 'Rizky Ramadhan', relationCode: 'self', gender: 'male', birthDate: '1990-03-25', bloodTypeCode: 'b', relationLabel: 'Diri Sendiri' },
        { fullName: 'Anisa Pratiwi', relationCode: 'spouse', gender: 'female', birthDate: '1993-07-12', bloodTypeCode: 'b', relationLabel: 'Istri' },
        { fullName: 'Farhan Ramadhan', relationCode: 'child', gender: 'male', birthDate: '2025-05-18', bloodTypeCode: 'b', relationLabel: 'Anak (Bayi)' },
      ],
    },
    {
      headEmail: 'dian.kusuma@gmail.com',
      headName: 'Dian Kusuma',
      phone: '081320000003',
      address: 'Jl. Setiabudi No. 201 RT 01/RW 06',
      district: 'Cidadap',
      members: [
        { fullName: 'Dian Kusuma', relationCode: 'self', gender: 'female', birthDate: '1988-12-04', bloodTypeCode: 'a', relationLabel: 'Diri Sendiri' },
        { fullName: 'Bambang Wijaya', relationCode: 'spouse', gender: 'male', birthDate: '1986-09-18', bloodTypeCode: 'o', relationLabel: 'Suami' },
        { fullName: 'Nabila Wijaya', relationCode: 'child', gender: 'female', birthDate: '2021-06-30', bloodTypeCode: 'a', relationLabel: 'Anak' },
        { fullName: 'Hj. Sumarni', relationCode: 'parent', gender: 'female', birthDate: '1958-04-12', bloodTypeCode: 'o', relationLabel: 'Ibu Kandung (Lansia)' },
      ],
    },
    {
      headEmail: 'bayu.saputra@gmail.com',
      headName: 'Bayu Saputra',
      phone: '081320000004',
      address: 'Jl. Surya Sumantri No. 88 RT 03/RW 02',
      district: 'Sukawarna',
      members: [
        { fullName: 'Bayu Saputra', relationCode: 'self', gender: 'male', birthDate: '1995-01-15', bloodTypeCode: 'ab', relationLabel: 'Diri Sendiri' },
        { fullName: 'Tri Wahyuni', relationCode: 'spouse', gender: 'female', birthDate: '1996-10-22', bloodTypeCode: 'o', relationLabel: 'Istri' },
        { fullName: 'Aditya Saputra', relationCode: 'child', gender: 'male', birthDate: '2024-09-08', bloodTypeCode: 'ab', relationLabel: 'Anak Balita' },
      ],
    },
    {
      headEmail: 'hendra.gunawan@gmail.com',
      headName: 'Hendra Gunawan',
      phone: '081320000005',
      address: 'Jl. Pasteur No. 15 RT 05/RW 04',
      district: 'Pasteur',
      members: [
        { fullName: 'Hendra Gunawan', relationCode: 'self', gender: 'male', birthDate: '1985-07-29', bloodTypeCode: 'o', relationLabel: 'Diri Sendiri' },
        { fullName: 'Ratna Sari', relationCode: 'spouse', gender: 'female', birthDate: '1987-02-14', bloodTypeCode: 'a', relationLabel: 'Istri' },
        { fullName: 'Kevin Gunawan', relationCode: 'child', gender: 'male', birthDate: '2016-08-11', bloodTypeCode: 'o', relationLabel: 'Anak' },
        { fullName: 'H. Gunawan Sudrajat', relationCode: 'parent', gender: 'male', birthDate: '1955-11-20', bloodTypeCode: 'o', relationLabel: 'Ayah Kandung (Lansia)' },
      ],
    },
    {
      headEmail: 'eko.prasetyo@gmail.com',
      headName: 'Eko Prasetyo',
      phone: '081320000006',
      address: 'Jl. Cihampelas No. 92 RT 02/RW 08',
      district: 'Coblong',
      members: [
        { fullName: 'Eko Prasetyo', relationCode: 'self', gender: 'male', birthDate: '1991-04-10', bloodTypeCode: 'b', relationLabel: 'Diri Sendiri' },
        { fullName: 'Maya Anggraini', relationCode: 'spouse', gender: 'female', birthDate: '1993-09-03', bloodTypeCode: 'o', relationLabel: 'Istri' },
        { fullName: 'Arkan Prasetyo', relationCode: 'child', gender: 'male', birthDate: '2022-03-14', bloodTypeCode: 'b', relationLabel: 'Anak Balita' },
      ],
    },
    {
      headEmail: 'dwi.setiawan@gmail.com',
      headName: 'Dwi Setiawan',
      phone: '081320000007',
      address: 'Jl. Cipaganti No. 64 RT 01/RW 03',
      district: 'Sukajadi',
      members: [
        { fullName: 'Dwi Setiawan', relationCode: 'self', gender: 'male', birthDate: '1989-11-19', bloodTypeCode: 'a', relationLabel: 'Diri Sendiri' },
        { fullName: 'Linda Marlina', relationCode: 'spouse', gender: 'female', birthDate: '1992-06-25', bloodTypeCode: 'b', relationLabel: 'Istri' },
        { fullName: 'Kenzo Setiawan', relationCode: 'child', gender: 'male', birthDate: '2024-07-02', bloodTypeCode: 'ab', relationLabel: 'Anak Bayi' },
      ],
    },
    {
      headEmail: 'irwan.syahputra@gmail.com',
      headName: 'Irwan Syahputra',
      phone: '081320000008',
      address: 'Jl. Dago Asri No. 18 RT 06/RW 09',
      district: 'Coblong',
      members: [
        { fullName: 'Irwan Syahputra', relationCode: 'self', gender: 'male', birthDate: '1987-08-08', bloodTypeCode: 'o', relationLabel: 'Diri Sendiri' },
        { fullName: 'Fitri Handayani', relationCode: 'spouse', gender: 'female', birthDate: '1990-01-30', bloodTypeCode: 'o', relationLabel: 'Istri' },
        { fullName: 'Azka Syahputra', relationCode: 'child', gender: 'male', birthDate: '2020-04-17', bloodTypeCode: 'o', relationLabel: 'Anak' },
      ],
    },
    {
      headEmail: 'agung.nugroho@gmail.com',
      headName: 'Agung Nugroho',
      phone: '081320000009',
      address: 'Jl. Sarijadi Raya Blok 8 No. 12',
      district: 'Sukasari',
      members: [
        { fullName: 'Agung Nugroho', relationCode: 'self', gender: 'male', birthDate: '1993-02-18', bloodTypeCode: 'a', relationLabel: 'Diri Sendiri' },
        { fullName: 'Dewi Lestari', relationCode: 'spouse', gender: 'female', birthDate: '1995-12-09', bloodTypeCode: 'a', relationLabel: 'Istri' },
        { fullName: 'Alif Nugroho', relationCode: 'child', gender: 'male', birthDate: '2023-10-01', bloodTypeCode: 'a', relationLabel: 'Anak Balita' },
      ],
    },
    {
      headEmail: 'dimas.anggara@gmail.com',
      headName: 'Dimas Anggara',
      phone: '081320000010',
      address: 'Jl. Pasirkaliki No. 110 RT 03/RW 05',
      district: 'Cicendo',
      members: [
        { fullName: 'Dimas Anggara', relationCode: 'self', gender: 'male', birthDate: '1994-06-21', bloodTypeCode: 'b', relationLabel: 'Diri Sendiri' },
        { fullName: 'Putri Wulandari', relationCode: 'spouse', gender: 'female', birthDate: '1996-03-15', bloodTypeCode: 'o', relationLabel: 'Istri' },
        { fullName: 'Zhafira Anggara', relationCode: 'child', gender: 'female', birthDate: '2025-01-11', bloodTypeCode: 'b', relationLabel: 'Anak Bayi' },
      ],
    },
    {
      headEmail: 'fajar.sidik@gmail.com',
      headName: 'Fajar Sidik',
      phone: '081320000011',
      address: 'Jl. Padjajaran No. 76 RT 02/RW 01',
      district: 'Cicendo',
      members: [
        { fullName: 'Fajar Sidik', relationCode: 'self', gender: 'male', birthDate: '1986-10-05', bloodTypeCode: 'o', relationLabel: 'Diri Sendiri' },
        { fullName: 'Ratih Permata', relationCode: 'spouse', gender: 'female', birthDate: '1989-05-20', bloodTypeCode: 'b', relationLabel: 'Istri' },
        { fullName: 'Hafiz Sidik', relationCode: 'child', gender: 'male', birthDate: '2019-09-12', bloodTypeCode: 'o', relationLabel: 'Anak' },
      ],
    },
    {
      headEmail: 'yoga.pratama@gmail.com',
      headName: 'Yoga Pratama',
      phone: '081320000012',
      address: 'Jl. Sukamulya Indah No. 33 RT 04/RW 07',
      district: 'Sukajadi',
      members: [
        { fullName: 'Yoga Pratama', relationCode: 'self', gender: 'male', birthDate: '1992-09-14', bloodTypeCode: 'a', relationLabel: 'Diri Sendiri' },
        { fullName: 'Kartika Sari', relationCode: 'spouse', gender: 'female', birthDate: '1994-11-28', bloodTypeCode: 'o', relationLabel: 'Istri' },
        { fullName: 'Kenzie Pratama', relationCode: 'child', gender: 'male', birthDate: '2022-08-19', bloodTypeCode: 'a', relationLabel: 'Anak Balita' },
      ],
    },
    {
      headEmail: 'aris.munandar@gmail.com',
      headName: 'Aris Munandar',
      phone: '081320000013',
      address: 'Jl. Karang Tineung No. 14 RT 01/RW 04',
      district: 'Sukajadi',
      members: [
        { fullName: 'Aris Munandar', relationCode: 'self', gender: 'male', birthDate: '1990-07-07', bloodTypeCode: 'b', relationLabel: 'Diri Sendiri' },
        { fullName: 'Indah Permatasari', relationCode: 'spouse', gender: 'female', birthDate: '1992-04-16', bloodTypeCode: 'a', relationLabel: 'Istri' },
        { fullName: 'Gibran Munandar', relationCode: 'child', gender: 'male', birthDate: '2024-04-25', bloodTypeCode: 'ab', relationLabel: 'Anak Balita' },
      ],
    },
    {
      headEmail: 'gilang.permana@gmail.com',
      headName: 'Gilang Permana',
      phone: '081320000014',
      address: 'Jl. Jurang No. 5 RT 02/RW 02',
      district: 'Sukajadi',
      members: [
        { fullName: 'Gilang Permana', relationCode: 'self', gender: 'male', birthDate: '1993-03-31', bloodTypeCode: 'o', relationLabel: 'Diri Sendiri' },
        { fullName: 'Citra Kirana', relationCode: 'spouse', gender: 'female', birthDate: '1995-08-04', bloodTypeCode: 'o', relationLabel: 'Istri' },
        { fullName: 'Vania Permana', relationCode: 'child', gender: 'female', birthDate: '2021-12-14', bloodTypeCode: 'o', relationLabel: 'Anak' },
      ],
    },
    {
      headEmail: 'doni.firmansyah@gmail.com',
      headName: 'Doni Firmansyah',
      phone: '081320000015',
      address: 'Jl. Bungur No. 29 RT 05/RW 06',
      district: 'Sukajadi',
      members: [
        { fullName: 'Doni Firmansyah', relationCode: 'self', gender: 'male', birthDate: '1984-11-12', bloodTypeCode: 'a', relationLabel: 'Diri Sendiri' },
        { fullName: 'Rini Susanti', relationCode: 'spouse', gender: 'female', birthDate: '1987-10-09', bloodTypeCode: 'b', relationLabel: 'Istri' },
        { fullName: 'Rizka Firmansyah', relationCode: 'child', gender: 'female', birthDate: '2017-05-23', bloodTypeCode: 'a', relationLabel: 'Anak' },
        { fullName: 'Hj. Sutrisno', relationCode: 'parent', gender: 'female', birthDate: '1956-02-15', bloodTypeCode: 'o', relationLabel: 'Ibu Kandung (Lansia)' },
      ],
    },
  ];

  const createdPatients: CreatedPatient[] = [];
  let mrnCounter = 1;

  for (const family of FAMILIES) {
    // 1. Create or ensure Head of Family user account
    const userRes = await client.query(
      `
      INSERT INTO users (name, email, phone, email_verified, phone_verified, status, preferred_locale, two_factor_enabled, created_at, updated_at)
      VALUES ($1, $2, $3, true, true, 'active', 'id-ID', false, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          status = 'active',
          updated_at = NOW()
      RETURNING id;
      `,
      [family.headName, family.headEmail, family.phone]
    );
    const familyHeadUserId = userRes.rows[0].id;

    // Insert user role
    await client.query(
      `
      INSERT INTO user_roles (user_id, role_id, assigned_at)
      VALUES ($1, $2, NOW() - INTERVAL '120 days')
      ON CONFLICT (user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;
      `,
      [familyHeadUserId, patientRole!.id]
    );

    // Insert into "user" (Better Auth)
    await client.query(
      `
      INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, true, 'patient', NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          "updatedAt" = NOW();
      `,
      [familyHeadUserId, family.headName, family.headEmail]
    );

    // Insert into "account" (Better Auth credential)
    await client.query(
      `
      INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1::text, 'credential', $1::uuid, $2, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
      ON CONFLICT (id) DO NOTHING;
      `,
      [familyHeadUserId, PASSWORD_HASH_SECRET123]
    );

    // 2. Iterate each member of the family
    for (const mem of family.members) {
      const mrn = `RM-2026-${String(mrnCounter).padStart(4, '0')}`;
      mrnCounter++;

      const bloodTypeId = bloodMap[mem.bloodTypeCode] || bloodO;
      const memberUserId = mem.relationCode === 'self' ? familyHeadUserId : null;

      // Generate verified NIK complying with Dukcapil format (birth date & female +40 offset)
      const securedNik = generateSecuredNik(mem.birthDate, mem.gender, mrnCounter);
      const motherName =
        family.members.find((m) => m.gender === 'female' && (m.relationCode === 'spouse' || m.relationCode === 'self'))?.fullName ||
        'Ibu Kandung';

      // Insert patient_profiles with canonical NIK blind-index and encryption
      const patRes = await client.query(
        `
        INSERT INTO patient_profiles (
          user_id, medical_record_number, full_name, birth_place, birth_date, gender, mother_name,
          national_id_hash, national_id_encrypted, blood_type_id, status, registered_at, phone, email, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, 'Kota Bandung', $4, $5, $6,
          $7, $8, $9, 'active', CURRENT_DATE - INTERVAL '120 days', $10, $11, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days'
        )
        ON CONFLICT (medical_record_number) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            birth_place = EXCLUDED.birth_place,
            birth_date = EXCLUDED.birth_date,
            gender = EXCLUDED.gender,
            mother_name = EXCLUDED.mother_name,
            national_id_hash = EXCLUDED.national_id_hash,
            national_id_encrypted = EXCLUDED.national_id_encrypted,
            blood_type_id = EXCLUDED.blood_type_id,
            status = 'active',
            updated_at = NOW()
        RETURNING id;
        `,
        [
          memberUserId,
          mrn,
          mem.fullName,
          mem.birthDate,
          mem.gender,
          motherName,
          securedNik.blindIndex,
          securedNik.encrypted,
          bloodTypeId,
          family.phone,
          mem.relationCode === 'self' ? family.headEmail : null,
        ]
      );
      const patientProfileId = patRes.rows[0].id;

      // 3. Insert patient_affiliations
      let relType = relSelf;
      if (mem.relationCode === 'spouse') relType = relSpouse;
      else if (mem.relationCode === 'child') relType = relChild;
      else if (mem.relationCode === 'parent') relType = relParent;

      await client.query(
        `
        INSERT INTO patient_affiliations (
          user_id, patient_id, relationship_type_id, relation_label, is_primary, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
        ON CONFLICT (user_id, patient_id) DO UPDATE
        SET relationship_type_id = EXCLUDED.relationship_type_id,
            relation_label = EXCLUDED.relation_label,
            is_primary = EXCLUDED.is_primary,
            updated_at = NOW();
        `,
        [familyHeadUserId, patientProfileId, relType.id, mem.relationLabel, mem.relationCode === 'self']
      );

      // 4. Insert patient_addresses
      await client.query(
        `
        INSERT INTO patient_addresses (
          patient_id, type, line1, full_address, district_name, regency_name, province_name, is_primary, created_at, updated_at
        )
        VALUES ($1, 'domicile', $2, $3, $4, 'Kota Bandung', 'Jawa Barat', true, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
        ON CONFLICT (patient_id, type) WHERE is_primary DO UPDATE
        SET line1 = EXCLUDED.line1,
            full_address = EXCLUDED.full_address,
            updated_at = NOW();
        `,
        [
          patientProfileId,
          family.address,
          `${family.address}, Kec. ${family.district}, Kota Bandung, Jawa Barat`,
          family.district,
        ]
      );

      // 5. Insert patient_emergency_contacts
      const emergencyContactName = mem.relationCode === 'self'
        ? (family.members.find((m) => m.relationCode === 'spouse')?.fullName || 'Keluarga')
        : family.headName;

      await client.query(
        `
        INSERT INTO patient_emergency_contacts (
          patient_id, name, relationship, phone, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days')
        ON CONFLICT (id) DO NOTHING;
        `,
        [
          patientProfileId,
          emergencyContactName,
          mem.relationCode === 'self' ? 'Pasangan' : 'Kepala Keluarga',
          family.phone,
        ]
      );

      createdPatients.push({
        userId: familyHeadUserId,
        patientProfileId,
        mrn,
        fullName: mem.fullName,
        email: family.headEmail,
        gender: mem.gender,
        birthDate: mem.birthDate,
        relationshipCode: mem.relationCode,
        familyHeadUserId,
      });
    }
  }

  return createdPatients;
}
