export interface ModulePackDefinition {
  id: string;
  title: string;
  description: string;
  viewCodes: string[];
  manageCodes: string[];
}

export const CLINICAL_MODULE_PACKS: Record<string, ModulePackDefinition> = {
  appointments: {
    id: 'appointments',
    title: 'Janji Temu & Jadwal',
    description: 'Reservasi janji temu, kalender jadwal dokter, dan ketersediaan sesi',
    viewCodes: ['appointments:read', 'schedules:read'],
    manageCodes: [
      'appointments:read',
      'appointments:book',
      'appointments:manage',
      'schedules:read',
      'schedules:manage',
    ],
  },
  queue: {
    id: 'queue',
    title: 'Pelayanan Antrean',
    description: 'Panggilan tiket antrean, pemanggilan ulang, pelayanan, dan penyelesaian sesi',
    viewCodes: ['queue:read'],
    manageCodes: [
      'queue:read',
      'queue:call',
      'queue:recall',
      'queue:serve',
      'queue:skip',
      'queue:complete',
      'queue:cancel',
    ],
  },
  records: {
    id: 'records',
    title: 'Rekam Medis & Diagnosis',
    description: 'Pengisian diagnosis klinis ICD-10, resep obat, dan riwayat rekam medis',
    viewCodes: ['records:read', 'patients:read'],
    manageCodes: [
      'records:read',
      'records:write',
      'prescriptions:write',
      'patients:read',
      'patients:manage',
    ],
  },
  patients: {
    id: 'patients',
    title: 'Pendaftaran & Data Pasien',
    description: 'Pendaftaran pasien baru, identitas demografi, dan berkas pasien',
    viewCodes: ['patients:read'],
    manageCodes: ['patients:read', 'patients:register', 'patients:manage'],
  },
  attendance: {
    id: 'attendance',
    title: 'Presensi & Kehadiran',
    description: 'Pencatatan presensi masuk/pulang, rekap kehadiran, dan persetujuan cuti',
    viewCodes: ['attendance:read', 'attendance:submit'],
    manageCodes: [
      'attendance:read',
      'attendance:submit',
      'attendance:review',
      'attendance:approve',
      'attendance:manage',
    ],
  },
  payroll: {
    id: 'payroll',
    title: 'Penggajian Klinik (Payroll)',
    description: 'Slip gaji mandiri, rekap gaji klinik, kalkulasi, dan penguncian buku',
    viewCodes: ['payroll:read_self'],
    manageCodes: [
      'payroll:read_self',
      'payroll:read',
      'payroll:calculate',
      'payroll:manage',
    ],
  },
  chat: {
    id: 'chat',
    title: 'Pesan Konsultasi (Chat)',
    description: 'Komunikasi dan pesan konsultasi daring dokter-pasien',
    viewCodes: ['chat:read'],
    manageCodes: ['chat:read', 'chat:send'],
  },
  staff: {
    id: 'staff',
    title: 'Kepegawaian & Karyawan',
    description: 'Direktori staf pegawai, undangan staf baru, dan status penugasan',
    viewCodes: ['staff:read'],
    manageCodes: ['staff:read', 'staff:invite', 'staff:manage'],
  },
  users: {
    id: 'users',
    title: 'Manajemen Akun Pengguna',
    description: 'Daftar pengguna sistem, pencadangan akun, pemulihan, dan penghapusan',
    viewCodes: ['users:read'],
    manageCodes: [
      'users:read',
      'users:manage',
      'users:delete',
      'users:export',
      'users:restore',
    ],
  },
  settings: {
    id: 'settings',
    title: 'Pengaturan Fasilitas & RBAC',
    description: 'Pengaturan poliklinik, ruangan, peran hak akses, dan siaran pengumuman',
    viewCodes: ['roles:read', 'pages:read', 'notifications:read', 'profile:read'],
    manageCodes: [
      'roles:read',
      'roles:manage',
      'pages:read',
      'pages:manage',
      'clinics:manage',
      'notifications:read',
      'notifications:broadcast',
      'profile:read',
      'profile:update',
    ],
  },
  general: {
    id: 'general',
    title: 'Akses Aplikasi Umum',
    description: 'Izin mendasar untuk masuk aplikasi dan mengelola profil akun sendiri',
    viewCodes: ['app:access', 'profile:read'],
    manageCodes: ['app:access', 'profile:read', 'profile:update'],
  },
};

export const PERMISSION_TO_MODULE_MAP: Record<string, string> = {
  // general
  'app:access': 'general',
  'profile:read': 'general',
  'profile:update': 'general',

  // appointments
  'appointments:read': 'appointments',
  'appointments:book': 'appointments',
  'appointments:manage': 'appointments',
  'schedules:read': 'appointments',
  'schedules:manage': 'appointments',

  // queue
  'queue:read': 'queue',
  'queue:call': 'queue',
  'queue:recall': 'queue',
  'queue:serve': 'queue',
  'queue:skip': 'queue',
  'queue:complete': 'queue',
  'queue:cancel': 'queue',

  // records
  'records:read': 'records',
  'records:write': 'records',
  'prescriptions:write': 'records',

  // patients
  'patients:read': 'patients',
  'patients:register': 'patients',
  'patients:manage': 'patients',

  // attendance
  'attendance:read': 'attendance',
  'attendance:submit': 'attendance',
  'attendance:review': 'attendance',
  'attendance:approve': 'attendance',
  'attendance:manage': 'attendance',

  // payroll
  'payroll:read_self': 'payroll',
  'payroll:read': 'payroll',
  'payroll:calculate': 'payroll',
  'payroll:manage': 'payroll',

  // chat
  'chat:read': 'chat',
  'chat:send': 'chat',

  // staff
  'staff:read': 'staff',
  'staff:invite': 'staff',
  'staff:manage': 'staff',

  // users
  'users:read': 'users',
  'users:manage': 'users',
  'users:delete': 'users',
  'users:export': 'users',
  'users:restore': 'users',

  // settings
  'roles:read': 'settings',
  'roles:manage': 'settings',
  'pages:read': 'settings',
  'pages:manage': 'settings',
  'clinics:manage': 'settings',
  'notifications:read': 'settings',
  'notifications:broadcast': 'settings',
};
