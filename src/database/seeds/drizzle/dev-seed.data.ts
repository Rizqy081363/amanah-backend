import { fakerID_ID as faker } from '@faker-js/faker';

faker.seed(20260917);

export const DEVELOPMENT_ROLE_SEEDS = [
  {
    code: 'admin',
    name: 'Administrator',
    description: 'Full clinic administration access',
  },
  {
    code: 'staff_doctor',
    name: 'Doctor',
    description: 'Practitioner access for doctors',
  },
  {
    code: 'staff_midwife',
    name: 'Midwife',
    description: 'Practitioner access for midwives',
  },
  {
    code: 'staff_worker',
    name: 'Worker',
    description: 'Operational staff access',
  },
  {
    code: 'patient',
    name: 'Patient',
    description: 'Patient portal and mobile access',
  },
] as const;

export type DevelopmentRoleCode =
  (typeof DEVELOPMENT_ROLE_SEEDS)[number]['code'];

export type DevelopmentUserSeed = {
  email: string;
  name: string;
  phone: string;
  roleCode: DevelopmentRoleCode;
  staff?: {
    staffCode: string;
    staffType: 'doctor' | 'midwife' | 'worker';
    primaryUnitCode: string;
    positionTitle: string;
    departmentName: string;
    practitioner?: {
      displayName: string;
      specialtyCode: string;
      defaultRoomCode: string;
      licenseNumber: string;
    };
  };
  patient?: {
    medicalRecordNumber: string;
    nationalId?: string;
    fullName: string;
    gender: 'male' | 'female';
    birthPlace: string;
    birthDate: string;
    phone: string;
    addressLine: string;
  };
};

const createPatientUserSeed = (sequence: number): DevelopmentUserSeed => {
  const gender = sequence % 2 === 0 ? 'female' : 'male';
  const firstName = faker.person.firstName(gender);
  const lastName = faker.person.lastName();
  const fullName = `${firstName} ${lastName}`;
  const patientNumber = sequence.toString().padStart(4, '0');

  return {
    email: `patient.${patientNumber}@amanah-healthcare.test`,
    name: fullName,
    phone: `62815${sequence.toString().padStart(8, '0')}`,
    roleCode: 'patient',
    patient: {
      medicalRecordNumber: `RM-2026-${patientNumber}`,
      nationalId: `3201${sequence.toString().padStart(12, '0')}`,
      fullName,
      gender,
      birthPlace: faker.location.city(),
      birthDate: faker.date
        .birthdate({ min: 18, max: 62, mode: 'age' })
        .toISOString()
        .slice(0, 10),
      phone: `0815${sequence.toString().padStart(8, '0')}`,
      addressLine: faker.location.streetAddress(),
    },
  };
};

export const DEVELOPMENT_USER_SEEDS: DevelopmentUserSeed[] = [
  {
    email: 'admin@amanah.com',
    name: 'Super Admin',
    phone: '6281200000099',
    roleCode: 'admin',
  },
  {
    email: 'dokter@amanah.com',
    name: 'dr. Ahmad Santoso',
    phone: '6281234567890',
    roleCode: 'staff_doctor',
    staff: {
      staffCode: 'DOC-AMANAH-001',
      staffType: 'doctor',
      primaryUnitCode: 'poli_umum',
      positionTitle: 'Dokter Umum',
      departmentName: 'Poli Umum',
      practitioner: {
        displayName: 'dr. Ahmad Santoso',
        specialtyCode: 'general_practitioner',
        defaultRoomCode: 'room_umum_1',
        licenseNumber: 'SIP-DOC-MAIN-001',
      },
    },
  },
  {
    email: 'bidan@amanah.com',
    name: 'Bdn. Siti Rahmawati',
    phone: '6281298765432',
    roleCode: 'staff_midwife',
    staff: {
      staffCode: 'BDN-AMANAH-001',
      staffType: 'midwife',
      primaryUnitCode: 'poli_kia',
      positionTitle: 'Bidan',
      departmentName: 'Poli KIA',
      practitioner: {
        displayName: 'Bdn. Siti Rahmawati',
        specialtyCode: 'maternal_child_health',
        defaultRoomCode: 'room_kia_2',
        licenseNumber: 'SIP-MID-MAIN-001',
      },
    },
  },
  {
    email: 'pasien@amanah.com',
    name: 'Dewi Lestari',
    phone: '081311223344',
    roleCode: 'patient',
    patient: {
      medicalRecordNumber: 'RM-2026-0001',
      nationalId: '3201234567890001',
      fullName: 'Dewi Lestari',
      gender: 'female',
      birthPlace: 'Bandung',
      birthDate: '1995-05-12',
      phone: '081311223344',
      addressLine: 'Jl. Merdeka No. 45, Bandung',
    },
  },
  {
    email: 'admin@amanah-healthcare.test',
    name: 'Nadia Rahma Pratama',
    phone: '6281200000001',
    roleCode: 'admin',
  },
  {
    email: 'dr.ahmad@amanah-healthcare.test',
    name: 'dr. Ahmad Santoso',
    phone: '6281200000002',
    roleCode: 'staff_doctor',
    staff: {
      staffCode: 'STF-DOC-001',
      staffType: 'doctor',
      primaryUnitCode: 'poli_umum',
      positionTitle: 'Dokter Umum',
      departmentName: 'Poli Umum',
      practitioner: {
        displayName: 'dr. Ahmad Santoso',
        specialtyCode: 'general_practitioner',
        defaultRoomCode: 'room_umum_1',
        licenseNumber: 'SIP-DOC-001',
      },
    },
  },
  {
    email: 'dr.maya@amanah-healthcare.test',
    name: 'dr. Maya Putri',
    phone: '6281200000003',
    roleCode: 'staff_doctor',
    staff: {
      staffCode: 'STF-DOC-002',
      staffType: 'doctor',
      primaryUnitCode: 'poli_umum',
      positionTitle: 'Dokter Umum',
      departmentName: 'Poli Umum',
      practitioner: {
        displayName: 'dr. Maya Putri',
        specialtyCode: 'general_practitioner',
        defaultRoomCode: 'room_umum_2',
        licenseNumber: 'SIP-DOC-002',
      },
    },
  },
  {
    email: 'dr.rizky@amanah-healthcare.test',
    name: 'dr. Rizky Maulana',
    phone: '6281200000004',
    roleCode: 'staff_doctor',
    staff: {
      staffCode: 'STF-DOC-003',
      staffType: 'doctor',
      primaryUnitCode: 'poli_kia',
      positionTitle: 'Dokter KIA',
      departmentName: 'Poli KIA',
      practitioner: {
        displayName: 'dr. Rizky Maulana',
        specialtyCode: 'maternal_child_health',
        defaultRoomCode: 'room_kia_1',
        licenseNumber: 'SIP-DOC-003',
      },
    },
  },
  {
    email: 'bidan.siti@amanah-healthcare.test',
    name: 'Bdn. Siti Rahmawati',
    phone: '6281200000005',
    roleCode: 'staff_midwife',
    staff: {
      staffCode: 'STF-MID-001',
      staffType: 'midwife',
      primaryUnitCode: 'poli_kia',
      positionTitle: 'Bidan',
      departmentName: 'Poli KIA',
      practitioner: {
        displayName: 'Bdn. Siti Rahmawati',
        specialtyCode: 'maternal_child_health',
        defaultRoomCode: 'room_kia_2',
        licenseNumber: 'SIP-MID-001',
      },
    },
  },
  {
    email: 'bidan.laras@amanah-healthcare.test',
    name: 'Bdn. Laras Wulandari',
    phone: '6281200000006',
    roleCode: 'staff_midwife',
    staff: {
      staffCode: 'STF-MID-002',
      staffType: 'midwife',
      primaryUnitCode: 'poli_kia',
      positionTitle: 'Bidan',
      departmentName: 'Poli KIA',
      practitioner: {
        displayName: 'Bdn. Laras Wulandari',
        specialtyCode: 'maternal_child_health',
        defaultRoomCode: 'room_kia_2',
        licenseNumber: 'SIP-MID-002',
      },
    },
  },
  {
    email: 'support.rani@amanah-healthcare.test',
    name: 'Rani Oktaviani',
    phone: '6281200000007',
    roleCode: 'staff_worker',
    staff: {
      staffCode: 'STF-WRK-001',
      staffType: 'worker',
      primaryUnitCode: 'it_support',
      positionTitle: 'IT Support',
      departmentName: 'Support',
    },
  },
  {
    email: 'frontdesk.dimas@amanah-healthcare.test',
    name: 'Dimas Prakoso',
    phone: '6281200000008',
    roleCode: 'staff_worker',
    staff: {
      staffCode: 'STF-WRK-002',
      staffType: 'worker',
      primaryUnitCode: 'front_desk',
      positionTitle: 'Front Desk Officer',
      departmentName: 'Administrasi',
    },
  },
  ...Array.from({ length: 7 }, (_, index) => createPatientUserSeed(index + 2)),
];
