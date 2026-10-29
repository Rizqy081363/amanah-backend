import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateSessionDefDto {
  @ApiProperty({
    description: 'Identifier unik definisi shift operasional',
    example: 'd0d12ed6-ecda-4ed8-b3d9-f3b95d8f701a',
  })
  @IsNotEmpty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional({
    description: 'Label tampilan manusiawi shift operasional',
    example: 'Sesi Pagi',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    description: 'Prefix kartu/tiket antrean (1-4 karakter alfanumerik)',
    example: 'P',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,4}$/, {
    message: 'codePrefix must be 1-4 alphanumeric characters',
  })
  codePrefix?: string;

  @ApiPropertyOptional({
    description: 'Status keaktifan definisi shift operasional',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Urutan tampilan shift operasional',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiPropertyOptional({
    description:
      'Waktu mulai standar master shift operasional (HH:mm atau HH:mm:ss)',
    example: '06:00:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'defaultStartsAt must be a valid time in HH:mm or HH:mm:ss format',
  })
  defaultStartsAt?: string;

  @ApiPropertyOptional({
    description:
      'Waktu selesai standar master shift operasional (HH:mm atau HH:mm:ss)',
    example: '12:00:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/, {
    message: 'defaultEndsAt must be a valid time in HH:mm or HH:mm:ss format',
  })
  defaultEndsAt?: string;

  @ApiPropertyOptional({
    description: 'Icon atau emoji representasi visual shift',
    example: '🌅',
  })
  @IsOptional()
  @IsString()
  icon?: string | null;
}

export class CreateSessionDefDto {
  @ApiProperty({
    description: 'Label tampilan manusiawi shift operasional (contoh: Sesi Pagi Buta)',
    example: 'Sesi Pagi Buta',
  })
  @IsNotEmpty()
  @IsString()
  label: string;

  @ApiPropertyOptional({
    description: 'Kode internal shift. Jika kosong dibuat otomatis dari label.',
    example: 'pagi_buta',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({
    description: 'Prefix kartu antrean (1-4 karakter alfanumerik kapital)',
    example: 'PB',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,4}$/, {
    message: 'codePrefix must be 1-4 alphanumeric characters',
  })
  codePrefix: string;

  @ApiProperty({
    description: 'Waktu mulai standar (HH:mm atau HH:mm:ss)',
    example: '04:00:00',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'defaultStartsAt must be a valid time in HH:mm or HH:mm:ss format',
  })
  defaultStartsAt: string;

  @ApiProperty({
    description: 'Waktu selesai standar (HH:mm atau HH:mm:ss)',
    example: '08:00:00',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/, {
    message: 'defaultEndsAt must be a valid time in HH:mm or HH:mm:ss format',
  })
  defaultEndsAt: string;

  @ApiPropertyOptional({
    description: 'Urutan tampilan shift',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Status keaktifan awal',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Icon atau emoji representasi visual shift',
    example: '🌅',
  })
  @IsOptional()
  @IsString()
  icon?: string | null;
}

export class UpdateSingleSessionDefDto {
  @ApiPropertyOptional({
    description: 'Label tampilan manusiawi shift operasional',
    example: 'Sesi Pagi Buta',
  })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({
    description: 'Prefix kartu antrean (1-4 karakter alfanumerik kapital)',
    example: 'PB',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{1,4}$/, {
    message: 'codePrefix must be 1-4 alphanumeric characters',
  })
  codePrefix?: string;

  @ApiPropertyOptional({
    description: 'Waktu mulai standar (HH:mm atau HH:mm:ss)',
    example: '04:00:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'defaultStartsAt must be a valid time in HH:mm or HH:mm:ss format',
  })
  defaultStartsAt?: string;

  @ApiPropertyOptional({
    description: 'Waktu selesai standar (HH:mm atau HH:mm:ss)',
    example: '08:00:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/, {
    message: 'defaultEndsAt must be a valid time in HH:mm or HH:mm:ss format',
  })
  defaultEndsAt?: string;

  @ApiPropertyOptional({
    description: 'Urutan tampilan shift',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Status keaktifan',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Icon atau emoji representasi visual shift',
    example: '🌅',
  })
  @IsOptional()
  @IsString()
  icon?: string | null;
}

export class UpdateWeeklyTemplateItemDto {
  @ApiPropertyOptional({
    description: 'Identifier baris template jadwal mingguan jika sudah ada',
    example: 'fc3f0c80-4f2a-4e30-9b5a-d5b8852db3df',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({
    description:
      'Identifier referensi ke definisi shift operasional (session_def)',
    example: 'd0d12ed6-ecda-4ed8-b3d9-f3b95d8f701a',
  })
  @IsNotEmpty()
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    description: 'Hari dalam sepekan (0 = Minggu, 1 = Senin, ..., 6 = Sabtu)',
    example: 1,
  })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  @Max(6)
  dow: number;

  @ApiProperty({
    description: 'Waktu mulai sesi dalam format HH:mm atau HH:mm:ss',
    example: '08:00:00',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: 'startsAt must be a valid time in HH:mm or HH:mm:ss format',
  })
  startsAt: string;

  @ApiProperty({
    description: 'Waktu selesai sesi dalam format HH:mm atau HH:mm:ss',
    example: '12:00:00',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^(([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?|24:00(:00)?)$/, {
    message: 'endsAt must be a valid time in HH:mm or HH:mm:ss format',
  })
  endsAt: string;

  @ApiProperty({
    description: 'Status keaktifan sesi shift pada hari bersangkutan',
    example: true,
  })
  @IsNotEmpty()
  @IsBoolean()
  isActive: boolean;
}

export class UpdateClinicSettingItemDto {
  @ApiProperty({
    description:
      'Kunci konfigurasi operasional klinik pada tabel clinic_setting',
    example: 'duration.prior_minutes',
  })
  @IsNotEmpty()
  @IsString()
  key: string;

  @ApiProperty({
    description:
      'Nilai konfigurasi (tipe number, boolean, string, atau object)',
    example: 30,
  })
  @IsNotEmpty()
  value: any;
}

export class UpdateWeeklyTemplatesBatchDto {
  @ApiProperty({
    description: 'Daftar item konfigurasi template jadwal operasional mingguan',
    type: [UpdateWeeklyTemplateItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWeeklyTemplateItemDto)
  templates: UpdateWeeklyTemplateItemDto[];
}

export class UpdateClinicSettingsBatchDto {
  @ApiProperty({
    description: 'Daftar item parameter konfigurasi klinik yang diperbarui',
    type: [UpdateClinicSettingItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateClinicSettingItemDto)
  settings: UpdateClinicSettingItemDto[];
}

export class UpdateSessionDefsBatchDto {
  @ApiProperty({
    description: 'Daftar definisi shift operasional yang diperbarui',
    type: [UpdateSessionDefDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSessionDefDto)
  defs: UpdateSessionDefDto[];
}

export class UpdateScheduleConfigurationBatchDto {
  @ApiPropertyOptional({
    description: 'Pembaruan daftar definisi shift operasional',
    type: [UpdateSessionDefDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSessionDefDto)
  sessionDefs?: UpdateSessionDefDto[];

  @ApiPropertyOptional({
    description: 'Pembaruan template jadwal mingguan operasional',
    type: [UpdateWeeklyTemplateItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateWeeklyTemplateItemDto)
  weeklyTemplates?: UpdateWeeklyTemplateItemDto[];

  @ApiPropertyOptional({
    description: 'Pembaruan seluruh parameter pengaturan klinik',
    type: [UpdateClinicSettingItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateClinicSettingItemDto)
  clinicSettings?: UpdateClinicSettingItemDto[];

  @ApiPropertyOptional({
    description:
      'Pembaruan status aktif/nonaktif hari operasional klinik (master_day)',
  })
  @IsOptional()
  @IsArray()
  operatingDays?: Array<{ dow: number; isActive: boolean }>;
}

export class EvaluateScheduleImpactDto extends UpdateScheduleConfigurationBatchDto {}

export class ScheduleConfigurationImpactResultDto {
  @ApiProperty({
    description: 'Tingkat keparahan dampak (NONE, LOW, HIGH)',
    enum: ['NONE', 'LOW', 'HIGH'],
    example: 'HIGH',
  })
  severity: 'NONE' | 'LOW' | 'HIGH';

  @ApiProperty({
    description: 'Jumlah dokter yang terikat pada shift/jadwal yang terdampak',
    example: 4,
  })
  affectedDoctorsCount: number;

  @ApiProperty({
    description: 'Jumlah janji temu aktif pasien di masa depan yang terdampak',
    example: 12,
  })
  affectedAppointmentsCount: number;

  @ApiProperty({
    description:
      'Daftar pesan peringatan atau analisis konsekuensi operasional',
    type: [String],
  })
  warnings: string[];
}

export class DeleteSessionDefDto {
  @ApiPropertyOptional({
    description:
      'Paksa penghapusan berantai jika terdapat penugasan dokter atau template terkait',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  cascade?: boolean;

  @ApiPropertyOptional({
    description:
      'Teks konfirmasi (harus cocok persis dengan label atau kode shift)',
    example: 'halo',
  })
  @IsOptional()
  @IsString()
  confirmText?: string;
}

export class SessionDefImpactDoctorDayDto {
  @ApiProperty({
    description: 'Hari praktik dalam sepekan (0 = Minggu, 1 = Senin, ..., 6 = Sabtu)',
    example: 3,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dow: number;

  @ApiProperty({
    description: 'Nama hari dalam Bahasa Indonesia',
    example: 'Rabu',
  })
  @IsString()
  dayName: string;

  @ApiPropertyOptional({
    description: 'Nama ruangan praktik preferensi',
    example: 'Ruang Poli Umum 1',
  })
  @IsOptional()
  @IsString()
  roomName?: string | null;
}

export class SessionDefImpactDoctorDto {
  @ApiProperty({
    description: 'Identifier dokter / praktisi',
    example: 'd403922c-2da2-4191-a04b-c9d6ce0e513a',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Nama tampilan dokter praktisi',
    example: 'Dr. Zikri Fadhiilah Ahmad',
  })
  @IsString()
  displayName: string;

  @ApiPropertyOptional({
    description: 'Spesialisasi medis dokter',
    example: 'Dokter Umum',
  })
  @IsOptional()
  @IsString()
  specialty?: string | null;

  @ApiProperty({
    description: 'Daftar hari dan ruangan penugasan pada shift ini',
    type: [SessionDefImpactDoctorDayDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionDefImpactDoctorDayDto)
  activeDays: SessionDefImpactDoctorDayDto[];
}

export class SessionDefImpactResultDto {
  @ApiProperty({
    description: 'Identifier unik shift operasional',
    example: 'a57ad2ca-084a-479f-8ff5-05bbccb3701c',
  })
  @IsUUID()
  shiftId: string;

  @ApiProperty({
    description: 'Label tampilan manusiawi shift operasional',
    example: 'halo',
  })
  @IsString()
  shiftLabel: string;

  @ApiProperty({
    description: 'Kode internal shift operasional',
    example: 'halo',
  })
  @IsString()
  shiftCode: string;

  @ApiProperty({
    description: 'Total baris penugasan dokter yang terikat pada shift ini',
    example: 7,
  })
  @IsInt()
  totalAssignmentsCount: number;

  @ApiProperty({
    description: 'Jumlah individu dokter aktif yang terdampak',
    example: 1,
  })
  @IsInt()
  affectedDoctorsCount: number;

  @ApiProperty({
    description: 'Daftar detail kartu dokter yang terdampak beserta jadwalnya',
    type: [SessionDefImpactDoctorDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionDefImpactDoctorDto)
  affectedDoctors: SessionDefImpactDoctorDto[];

  @ApiProperty({
    description: 'Jumlah template mingguan operasional klinik yang terikat',
    example: 7,
  })
  @IsInt()
  weeklyTemplatesCount: number;

  @ApiProperty({
    description: 'Apakah terdapat tiket antrean pasien yang terikat pada shift ini',
    example: false,
  })
  @IsBoolean()
  hasActiveTickets: boolean;

  @ApiProperty({
    description: 'Jumlah tiket antrean pasien yang terikat',
    example: 0,
  })
  @IsInt()
  activeTicketsCount: number;
}

