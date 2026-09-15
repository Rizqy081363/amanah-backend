import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { fakerID_ID as faker } from '@faker-js/faker';
import * as schema from '../../schema';
import { RoleEnum } from '../../../roles/roles.enum';
import { StatusEnum } from '../../../statuses/statuses.enum';
import { AuthProvidersEnum } from '../../../auth/auth-providers.enum';

dotenv.config();

async function runSeed() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://${process.env.DATABASE_USERNAME || 'root'}:${process.env.DATABASE_PASSWORD || 'secret'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'api'}`,
  });

  const db = drizzle(pool, { schema });

  console.log('🌱 1. Seeding system roles & statuses...');
  await db
    .insert(schema.roles)
    .values([
      { id: RoleEnum.admin, name: 'Admin' },
      { id: RoleEnum.user, name: 'User' },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.statuses)
    .values([
      { id: StatusEnum.active, name: 'Active' },
      { id: StatusEnum.inactive, name: 'Inactive' },
    ])
    .onConflictDoNothing();

  console.log('🌱 2. Seeding Poliklinik (Poli Umum & Poli KIA)...');
  await db
    .insert(schema.poliklinik)
    .values([
      {
        kodePoli: 'POLI-UMUM',
        namaPoli: 'Poli Umum',
        deskripsi: 'Pelayanan kesehatan umum, pemeriksaan dokter, dan resep obat.',
        isActive: true,
      },
      {
        kodePoli: 'POLI-KIA',
        namaPoli: 'Poli KIA (Kesehatan Ibu & Anak)',
        deskripsi:
          'Pelayanan kesehatan ibu, pemeriksaan kehamilan (ANC), nifas, KB, dan imunisasi anak.',
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  const poliUmum = (await db.query.poliklinik.findFirst({
    where: eq(schema.poliklinik.kodePoli, 'POLI-UMUM'),
  }))!;

  const poliKia = (await db.query.poliklinik.findFirst({
    where: eq(schema.poliklinik.kodePoli, 'POLI-KIA'),
  }))!;

  console.log('🌱 3. Seeding Layanan Poli...');
  const layananUmumData = [
    {
      poliklinikId: poliUmum.id,
      namaLayanan: 'Pemeriksaan Kesehatan Umum',
      medicalFlow: 'general' as const,
      deskripsi: 'Diagnosa penyakit umum dan keluhan harian pasien',
    },
    {
      poliklinikId: poliUmum.id,
      namaLayanan: 'Konsultasi Dokter & Resep Obat',
      medicalFlow: 'general' as const,
      deskripsi: 'Konsultasi lanjutan dengan dokter umum',
    },
    {
      poliklinikId: poliUmum.id,
      namaLayanan: 'Surat Keterangan Sehat',
      medicalFlow: 'general' as const,
      deskripsi: 'Pemeriksaan fisik untuk pembuatan surat sehat',
    },
    {
      poliklinikId: poliUmum.id,
      namaLayanan: 'Pemeriksaan Laboratorium Sederhana (Gula Darah/Kolesterol/Asam Urat)',
      medicalFlow: 'general' as const,
      deskripsi: 'Tes skrining darah cepat',
    },
  ];

  const layananKiaData = [
    {
      poliklinikId: poliKia.id,
      namaLayanan: 'Pemeriksaan Kehamilan (ANC / Antenatal Care)',
      medicalFlow: 'pregnancy' as const,
      deskripsi: 'Pemeriksaan rutin trimester 1-3, USG dasar, dan buku KIA',
    },
    {
      poliklinikId: poliKia.id,
      namaLayanan: 'Pelayanan Nifas & Menyusui (PNC / Postnatal Care)',
      medicalFlow: 'pregnancy' as const,
      deskripsi: 'Pemeriksaan pasca persalinan dan konseling laktasi',
    },
    {
      poliklinikId: poliKia.id,
      namaLayanan: 'Imunisasi Dasar Bayi & Balita (BCG, DPT, Polio, Campak, dll)',
      medicalFlow: 'immunization' as const,
      deskripsi: 'Vaksinasi berkala sesuai kalender Kemenkes RI',
    },
    {
      poliklinikId: poliKia.id,
      namaLayanan: 'Pelayanan KB (Suntik, IUD, Implan, Pil)',
      medicalFlow: 'pregnancy' as const,
      deskripsi: 'Pemasangan dan kontrol kontrasepsi',
    },
    {
      poliklinikId: poliKia.id,
      namaLayanan: 'Pemeriksaan Calon Pengantin (Catin)',
      medicalFlow: 'general' as const,
      deskripsi: 'Pemeriksaan pra-nikah untuk calon pengantin',
    },
  ];

  for (const lay of [...layananUmumData, ...layananKiaData]) {
    await db.insert(schema.layananPoli).values(lay).onConflictDoNothing();
  }

  console.log('🌱 4. Seeding Default Users (Admin, Dokter, Bidan, Pasien)...');
  const salt = await bcrypt.genSalt();
  const password = await bcrypt.hash('secret123', salt);

  // 4a. Super Admin
  await db
    .insert(schema.users)
    .values({
      email: 'admin@amanah.com',
      password: password,
      provider: AuthProvidersEnum.email,
      firstName: 'Super',
      lastName: 'Admin',
      systemRole: 'ADMIN',
      roleId: RoleEnum.admin,
      statusId: StatusEnum.active,
    })
    .onConflictDoNothing();

  // 4b. Dokter Poli Umum
  await db
    .insert(schema.users)
    .values({
      email: 'dokter@amanah.com',
      password: password,
      provider: AuthProvidersEnum.email,
      firstName: 'dr. Ahmad',
      lastName: 'Santoso',
      systemRole: 'STAF',
      roleId: RoleEnum.user,
      statusId: StatusEnum.active,
    })
    .onConflictDoNothing();

  const dokterUser = await db.query.users.findFirst({
    where: eq(schema.users.email, 'dokter@amanah.com'),
    with: { staff: true },
  });

  let dokterStaffId = dokterUser?.staff?.id || '';
  if (dokterUser && !dokterUser.staff) {
    const [staffDoc] = await db
      .insert(schema.staffs)
      .values({
        userId: dokterUser.id,
        poliklinikId: poliUmum.id,
        fullName: 'dr. Ahmad Santoso',
        profession: 'Dokter Umum',
        idCardNumber: 'DOC-AMANAH-001',
        phoneNumber: '081234567890',
        isActive: true,
      })
      .onConflictDoNothing()
      .returning();

    if (staffDoc) dokterStaffId = staffDoc.id;
  }

  // 4c. Bidan Poli KIA
  await db
    .insert(schema.users)
    .values({
      email: 'bidan@amanah.com',
      password: password,
      provider: AuthProvidersEnum.email,
      firstName: 'Bdn. Siti',
      lastName: 'Rahmawati',
      systemRole: 'STAF',
      roleId: RoleEnum.user,
      statusId: StatusEnum.active,
    })
    .onConflictDoNothing();

  const bidanUser = await db.query.users.findFirst({
    where: eq(schema.users.email, 'bidan@amanah.com'),
    with: { staff: true },
  });

  let bidanStaffId = bidanUser?.staff?.id || '';
  if (bidanUser && !bidanUser.staff) {
    const [staffBdn] = await db
      .insert(schema.staffs)
      .values({
        userId: bidanUser.id,
        poliklinikId: poliKia.id,
        fullName: 'Bdn. Siti Rahmawati, S.Tr.Keb',
        profession: 'Bidan',
        idCardNumber: 'BDN-AMANAH-001',
        phoneNumber: '081298765432',
        isActive: true,
      })
      .onConflictDoNothing()
      .returning();

    if (staffBdn) bidanStaffId = staffBdn.id;
  }

  // 4d. Pasien Dummy Utama
  await db
    .insert(schema.users)
    .values({
      email: 'pasien@amanah.com',
      password: password,
      provider: AuthProvidersEnum.email,
      firstName: 'Dewi',
      lastName: 'Lestari',
      systemRole: 'PATIENT',
      roleId: RoleEnum.user,
      statusId: StatusEnum.active,
    })
    .onConflictDoNothing();

  const pasienUser = await db.query.users.findFirst({
    where: eq(schema.users.email, 'pasien@amanah.com'),
    with: { patient: true },
  });

  if (pasienUser && !pasienUser.patient) {
    await db
      .insert(schema.patients)
      .values({
        userId: pasienUser.id,
        medicalRecordNumber: 'RM-2026-0001',
        nik: '3201234567890001',
        fullName: 'Dewi Lestari',
        gender: 'Perempuan',
        birthPlace: 'Bandung',
        birthDate: '1995-05-12',
        phoneNumber: '081311223344',
        address: 'Jl. Merdeka No. 45, Bandung',
        bloodType: 'O+',
      })
      .onConflictDoNothing();
  }

  console.log('🌱 5. Seeding Staff Schedules...');
  if (dokterStaffId) {
    await db
      .insert(schema.staffSchedules)
      .values([
        {
          staffId: dokterStaffId,
          dayOfWeek: 1, // Senin
          session: 'PAGI',
          isAvailable: true,
          notes: 'Praktek Pagi Poli Umum (08:00 - 12:00)',
        },
        {
          staffId: dokterStaffId,
          dayOfWeek: 1,
          session: 'SIANG',
          isAvailable: true,
          notes: 'Praktek Siang Poli Umum (13:00 - 17:00)',
        },
      ])
      .onConflictDoNothing();
  }

  if (bidanStaffId) {
    await db
      .insert(schema.staffSchedules)
      .values([
        {
          staffId: bidanStaffId,
          dayOfWeek: 1, // Senin
          session: 'PAGI',
          isAvailable: true,
          notes: 'Praktek ANC & Imunisasi Poli KIA (08:00 - 12:00)',
        },
      ])
      .onConflictDoNothing();
  }

  console.log('🌱 6. Seeding 5 Additional Realistic Patients (via Faker)...');
  const bloodTypes: Array<'A+' | 'B+' | 'AB+' | 'O+' | 'Belum Tahu'> = [
    'A+',
    'B+',
    'AB+',
    'O+',
    'Belum Tahu',
  ];

  for (let i = 2; i <= 6; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const isFemale = i % 2 === 0;
    const gender = isFemale ? 'Perempuan' : 'Laki-laki';
    const email = `pasien${i}@amanah.com`;
    const nik = `3201${faker.string.numeric(12)}`;
    const rm = `RM-2026-${String(i).padStart(4, '0')}`;

    await db
      .insert(schema.users)
      .values({
        email,
        password,
        provider: AuthProvidersEnum.email,
        firstName,
        lastName,
        systemRole: 'PATIENT',
        roleId: RoleEnum.user,
        statusId: StatusEnum.active,
      })
      .onConflictDoNothing();

    const u = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
      with: { patient: true },
    });

    if (u && !u.patient) {
      await db
        .insert(schema.patients)
        .values({
          userId: u.id,
          medicalRecordNumber: rm,
          nik,
          fullName: `${firstName} ${lastName}`,
          gender,
          birthPlace: faker.location.city(),
          birthDate: '1998-08-17',
          phoneNumber: `0812${faker.string.numeric(8)}`,
          address: faker.location.streetAddress(),
          bloodType: bloodTypes[i % bloodTypes.length],
        })
        .onConflictDoNothing();
    }
  }

  console.log('✅ Drizzle Seeding finished successfully!');
  console.log('Credentials seeded:');
  console.log('- Admin        : admin@amanah.com / secret123');
  console.log('- Dokter Umum  : dokter@amanah.com / secret123');
  console.log('- Bidan KIA    : bidan@amanah.com / secret123');
  console.log('- Pasien Utama : pasien@amanah.com / secret123');
  console.log('- Pasien 2 - 6 : pasien2@amanah.com s/d pasien6@amanah.com / secret123');

  await pool.end();
}

runSeed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
