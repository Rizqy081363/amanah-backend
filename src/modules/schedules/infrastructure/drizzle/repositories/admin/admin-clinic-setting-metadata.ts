export type ClinicSettingCategory =
  | 'general'
  | 'duration'
  | 'queue'
  | 'notification'
  | 'attendance';

export type ClinicSettingControlType = 'text' | 'number' | 'boolean' | 'select';

export interface ClinicSettingOptionDescriptor {
  value: string;
  label: string;
  description?: string;
  flagCode?: string;
  countryCode?: string;
}

export interface ClinicSettingMetadataDescriptor {
  isAdminFacing: boolean;
  category: ClinicSettingCategory;
  label: string;
  description: string;
  controlType: ClinicSettingControlType;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: ClinicSettingOptionDescriptor[];
}

const CLINIC_SETTING_METADATA_REGISTRY: Record<
  string,
  ClinicSettingMetadataDescriptor
> = {
  // --- Operational Settings (Admin-Facing) ---
  'clinic.locale': {
    isAdminFacing: true,
    category: 'general',
    label: 'Negara & Format Bahasa',
    description:
      'Format regional untuk penanggalan, nomor telepon, dan bahasa komunikasi.',
    controlType: 'select',
    options: [
      {
        value: 'id-ID',
        label: 'Indonesia (ID)',
        description: 'Bahasa Indonesia (IDR, format 24 jam)',
        flagCode: 'id',
        countryCode: 'ID',
      },
    ],
  },
  'clinic.timezone': {
    isAdminFacing: true,
    category: 'general',
    label: 'Zona Waktu Operasional',
    description:
      'Zona waktu rujukan untuk perhitungan jam buka shift dan giliran antrean.',
    controlType: 'select',
    options: [
      { value: 'Asia/Jakarta', label: 'WIB - Waktu Indonesia Barat (UTC+7)' },
      {
        value: 'Asia/Makassar',
        label: 'WITA - Waktu Indonesia Tengah (UTC+8)',
      },
      { value: 'Asia/Jayapura', label: 'WIT - Waktu Indonesia Timur (UTC+9)' },
    ],
  },
  'clinic.date_format_style': {
    isAdminFacing: true,
    category: 'general',
    label: 'Gaya Format Tanggal Tampilan',
    description:
      'Standar pemformatan tanggal pada seluruh tampilan jadwal, janji temu, dan notifikasi.',
    controlType: 'select',
    options: [
      {
        value: 'human_full',
        label: 'Hari & Tanggal Lengkap (contoh: Minggu, 11 Oktober 2026)',
        description:
          'Menampilkan nama hari lengkap, tanggal, bulan panjang, dan tahun.',
      },
      {
        value: 'human_medium',
        label: 'Tanggal Standar (contoh: 11 Oktober 2026)',
        description:
          'Menampilkan tanggal, bulan panjang, dan tahun tanpa nama hari.',
      },
      {
        value: 'human_short',
        label: 'Tanggal Ringkas (contoh: 11 Okt 2026)',
        description: 'Menampilkan tanggal, singkatan bulan, dan tahun.',
      },
      {
        value: 'iso',
        label: 'Format Standar ISO (contoh: 2026-10-11)',
        description: 'Format numerik standar YYYY-MM-DD.',
      },
    ],
  },
  'clinic.time_format_style': {
    isAdminFacing: true,
    category: 'general',
    label: 'Format Penulisan Waktu Jam',
    description:
      'Format penulisan jam pelayanan klinik pada jadwal dan antrean.',
    controlType: 'select',
    options: [
      { value: '24h', label: 'Format 24 Jam (contoh: 14:30 WIB)' },
      { value: '12h', label: 'Format 12 Jam AM/PM (contoh: 02:30 PM)' },
    ],
  },
  'feature.queue_engine': {
    isAdminFacing: true,
    category: 'general',
    label: 'Otomasi Mesin Antrean',
    description: 'Mode pengendalian pemanggilan dan kalkulasi antrean klinik.',
    controlType: 'select',
    options: [
      { value: 'off', label: 'Manual (Dipanggil Petugas)' },
      { value: 'manual', label: 'Semi-Otomatis (Bantuan Sistem)' },
      { value: 'smart', label: 'Otomatis Cerdas (Smart Engine)' },
    ],
  },
  'notify.channel': {
    isAdminFacing: true,
    category: 'notification',
    label: 'Kanal Utama Notifikasi',
    description:
      'Kanal pengiriman informasi status antrean dan jadwal konsultasi.',
    controlType: 'select',
    options: [
      { value: 'in_app', label: 'Aplikasi Klinik (In-App)' },
      { value: 'whatsapp', label: 'Pesan WhatsApp' },
      { value: 'sms', label: 'Pesan SMS' },
    ],
  },
  'duration.prior_minutes': {
    isAdminFacing: true,
    category: 'duration',
    label: 'Estimasi Durasi Konsultasi',
    description:
      'Durasi rata-rata per pasien untuk acuan jadwal dan estimasi pelayanan.',
    controlType: 'number',
    unit: 'menit',
    min: 5,
    max: 120,
    step: 5,
  },
  'duration.valid_min_minutes': {
    isAdminFacing: true,
    category: 'duration',
    label: 'Batas Minimum Durasi Konsultasi',
    description:
      'Ambang batas waktu konsultasi tercepat yang diizinkan sistem.',
    controlType: 'number',
    unit: 'menit',
    min: 1,
    max: 30,
    step: 1,
  },
  'duration.valid_max_minutes': {
    isAdminFacing: true,
    category: 'duration',
    label: 'Batas Maksimum Durasi Konsultasi',
    description:
      'Ambang batas waktu konsultasi maksimal sebelum evaluasi pelayanan.',
    controlType: 'number',
    unit: 'menit',
    min: 30,
    max: 240,
    step: 5,
  },
  'duration.min_remaining_minutes': {
    isAdminFacing: true,
    category: 'duration',
    label: 'Batas Sisa Waktu Akhir Shift',
    description:
      'Waktu minimal sebelum jam shift berakhir untuk menerima pasien baru.',
    controlType: 'number',
    unit: 'menit',
    min: 0,
    max: 60,
    step: 5,
  },
  'queue.arrive_early_minutes': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Anjuran Waktu Tiba Pasien',
    description:
      'Waktu sebelum estimasi panggilan saat pasien dianjurkan tiba di klinik.',
    controlType: 'number',
    unit: 'menit',
    min: 0,
    max: 60,
    step: 5,
  },
  'queue.overflow_tolerance_minutes': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Toleransi Pelayanan Melewati Shift',
    description:
      'Batas kelonggaran waktu dokter melayani pasien setelah jam resmi shift selesai.',
    controlType: 'number',
    unit: 'menit',
    min: 0,
    max: 120,
    step: 5,
  },
  'queue.no_show_grace_minutes': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Tenggat Keterlambatan Pasien',
    description:
      'Waktu tunggu pemanggilan sebelum antrean dialihkan atau ditandai tidak hadir.',
    controlType: 'number',
    unit: 'menit',
    min: 1,
    max: 60,
    step: 1,
  },
  'queue.no_show_call_attempts': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Batas Pengulangan Panggilan',
    description:
      'Jumlah pengulangan pemanggilan nomor antrean sebelum dialihkan.',
    controlType: 'number',
    unit: 'kali',
    min: 1,
    max: 10,
    step: 1,
  },
  'queue.search_horizon_days': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Batas Reservasi Jadwal ke Depan',
    description:
      'Jarak hari maksimal ke depan bagi pasien untuk membuat reservasi jadwal.',
    controlType: 'number',
    unit: 'hari',
    min: 1,
    max: 90,
    step: 1,
  },
  'queue.check_in_window_hours': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Masa Berlaku Check-In QR',
    description:
      'Batas durasi berlakunya QR code check-in sejak dibuat oleh petugas/admin hingga kedaluwarsa.',
    controlType: 'number',
    unit: 'jam',
    min: 1,
    max: 72,
    step: 1,
  },
  'ticket.max_active_per_patient_category_day': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Batas Antrean Aktif Per Pasien',
    description:
      'Batas jumlah tiket antrean aktif per pasien pada poli yang sama per hari.',
    controlType: 'number',
    unit: 'tiket',
    min: 1,
    max: 5,
    step: 1,
  },
  'ticket.reschedule_warn_when_ahead_lte': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Peringatan Jadwal Ulang Berjarak Dekat',
    description:
      'Peringatan otomatis bila pasien di depan antrean tersisa sedikit.',
    controlType: 'number',
    unit: 'antrean',
    min: 0,
    max: 10,
    step: 1,
  },
  'ticket.show_doctor_when_called': {
    isAdminFacing: true,
    category: 'queue',
    label: 'Tampilkan Nama Dokter di Layar Antrean',
    description:
      'Menampilkan nama praktisi yang memanggil pada layar display antrean.',
    controlType: 'boolean',
  },
  'eta.display_round_minutes': {
    isAdminFacing: true,
    category: 'notification',
    label: 'Pembulatan Estimasi Waktu di Layar',
    description:
      'Faktor pembulatan menit pada estimasi kedatangan antrean di display.',
    controlType: 'number',
    unit: 'menit',
    min: 1,
    max: 30,
    step: 1,
  },
  'eta.notify_delay_minutes': {
    isAdminFacing: true,
    category: 'notification',
    label: 'Jeda Notifikasi Pengingat Pasien',
    description: 'Waktu pemberitahuan sebelum giliran pasien tiba di klinik.',
    controlType: 'number',
    unit: 'menit',
    min: 1,
    max: 60,
    step: 5,
  },

  // --- Internal Algorithm & Infrastructure Tunables (Hidden from Clinic Administrators) ---
  'closure.min_open_segment_minutes': {
    isAdminFacing: false,
    category: 'duration',
    label: 'Min Open Segment Minutes',
    description: 'Internal segmentation threshold',
    controlType: 'number',
  },
  'closure.last_call_buffer_minutes': {
    isAdminFacing: false,
    category: 'duration',
    label: 'Last Call Buffer Minutes',
    description: 'Internal closure buffer',
    controlType: 'number',
  },
  'closure.long_confirm_days': {
    isAdminFacing: false,
    category: 'duration',
    label: 'Long Confirm Days',
    description: 'Internal closure lookahead',
    controlType: 'number',
  },
  'eta.spread_z': {
    isAdminFacing: false,
    category: 'notification',
    label: 'ETA Spread Z',
    description: 'Gaussian distribution factor',
    controlType: 'number',
  },
  'eta.update_threshold_minutes': {
    isAdminFacing: true,
    category: 'notification',
    label: 'Ambang Perubahan Estimasi Notifikasi',
    description:
      'Batas minimal pergeseran waktu (menit) untuk menyiarkan pembaruan estimasi antrean ke pasien.',
    controlType: 'number',
    unit: 'menit',
    min: 1,
    max: 60,
    step: 1,
  },

  // --- Attendance & Shift Settings (Admin-Facing) ---
  'attendance.late_tolerance_minutes': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Toleransi Keterlambatan Presensi',
    description:
      'Batas menit keterlambatan check-in dari jam mulai shift sebelum dicatat berstatus Terlambat.',
    controlType: 'number',
    unit: 'menit',
    min: 0,
    max: 120,
    step: 1,
  },
  'attendance.check_in_window_minutes_before': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Jendela Buka Presensi Masuk',
    description:
      'Waktu dimulainya izin scan presensi sebelum jadwal jam mulai shift.',
    controlType: 'number',
    unit: 'menit',
    min: 0,
    max: 120,
    step: 5,
  },
  'attendance.check_in_window_minutes_after': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Batas Akhir Jendela Presensi Masuk',
    description:
      'Batas waktu maksimal presensi masuk diperbolehkan setelah jam mulai shift.',
    controlType: 'number',
    unit: 'menit',
    min: 15,
    max: 240,
    step: 5,
  },
  'attendance.qr_rotation_seconds': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Interval Rotasi QR Presensi',
    description:
      'Durasi waktu aktif per token QR sebelum berotasi otomatis di terminal presensi.',
    controlType: 'number',
    unit: 'detik',
    min: 10,
    max: 300,
    step: 5,
  },
  'attendance.check_out_window_minutes_before': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Jendela Buka Presensi Pulang (Normal)',
    description:
      'Batas menit diperbolehkannya check-out normal sebelum jam shift usai. Presensi di dalam jendela ini mendapatkan kredit dinas penuh tanpa pemotongan.',
    controlType: 'number',
    unit: 'menit',
    min: 0,
    max: 120,
    step: 5,
  },
  'attendance.early_checkout_requires_notes': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Wajib Catatan Alasan Pulang Cepat',
    description:
      'Mewajibkan staf mengisi catatan alasan darurat jika melakukan check-out sebelum jendela normal dibuka.',
    controlType: 'boolean',
  },
  'attendance.overtime_enabled': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Kalkulasi Lembur Presensi',
    description:
      'Mengaktifkan pencatatan durasi dinas yang melebihi batas jam shift normal untuk payroll.',
    controlType: 'boolean',
  },
  'roster.break_duration_minutes': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Durasi Waktu Istirahat Shift',
    description:
      'Alokasi durasi istirahat (menit) per sesi dinas tugas untuk kalkulasi jam kerja bersih payroll.',
    controlType: 'number',
    unit: 'menit',
    min: 0,
    max: 120,
    step: 15,
  },
  'roster.is_break_paid': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Istirahat Tetap Dibayar (Paid Break)',
    description:
      'Jika diaktifkan, waktu istirahat tidak memotong jam kerja nominal pada kalkulasi payroll.',
    controlType: 'boolean',
  },
  'roster.break_deduction_scope': {
    isAdminFacing: true,
    category: 'attendance',
    label: 'Skema Pemotongan Istirahat Harian',
    description:
      'Aturan pemotongan istirahat jika staf memiliki beberapa sesi dalam 1 hari: per sesi dinas atau maksimal 1 kali per hari.',
    controlType: 'select',
    options: [
      { label: '1 Kali per Sesi Dinas (Rasional)', value: 'per_session' },
      { label: 'Maksimal 1 Kali per Hari (Jika beruntun)', value: 'per_day' },
    ],
  },
  'feature.legacy_compat': {
    isAdminFacing: false,
    category: 'general',
    label: 'Legacy Compatibility',
    description: 'Internal legacy route switch',
    controlType: 'boolean',
  },
  'duration.prior_weight': {
    isAdminFacing: false,
    category: 'duration',
    label: 'Prior Weight',
    description: 'Bayesian model prior weight',
    controlType: 'number',
  },
  'duration.window_days': {
    isAdminFacing: false,
    category: 'duration',
    label: 'Window Days',
    description: 'Historical sample window',
    controlType: 'number',
  },
  'duration.min_samples': {
    isAdminFacing: false,
    category: 'duration',
    label: 'Min Samples',
    description: 'Minimum sample size',
    controlType: 'number',
  },
  'duration.stale_factor': {
    isAdminFacing: false,
    category: 'duration',
    label: 'Stale Factor',
    description: 'Outlier multiplier',
    controlType: 'number',
  },
  'queue.load_ratio.ok_max': {
    isAdminFacing: false,
    category: 'queue',
    label: 'Queue OK Ratio Max',
    description: 'Load ratio threshold',
    controlType: 'number',
  },
  'queue.load_ratio.busy_max': {
    isAdminFacing: false,
    category: 'queue',
    label: 'Queue Busy Ratio Max',
    description: 'Load ratio threshold',
    controlType: 'number',
  },
};

export function getClinicSettingMetadata(
  key: string,
): ClinicSettingMetadataDescriptor {
  return (
    CLINIC_SETTING_METADATA_REGISTRY[key] ?? {
      isAdminFacing: false,
      category: 'general',
      label: key,
      description: `Parameter sistem ${key}`,
      controlType: 'text',
    }
  );
}
