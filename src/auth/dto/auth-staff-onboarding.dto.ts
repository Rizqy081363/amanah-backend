import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum StaffOnboardingRole {
  DOCTOR = 'doctor',
  MIDWIFE = 'midwife',
  WORKER = 'worker',
  STAFF = 'staff',
}

export class AuthStaffOnboardingDto {
  @ApiProperty({
    description:
      'Pilihan peran klinis: doctor (dokter), midwife (bidan), atau worker/staff (pekerja/staf)',
    enum: StaffOnboardingRole,
    example: 'doctor',
  })
  @IsEnum(StaffOnboardingRole, {
    message: 'Peran harus salah satu dari: doctor, midwife, worker, staff',
  })
  @IsNotEmpty({ message: 'Peran tidak boleh kosong' })
  role: StaffOnboardingRole;

  @ApiProperty({
    description: 'Nama lengkap staf dengan gelar',
    example: 'dr. Zikri Ahmad, Sp.A',
  })
  @IsString()
  @IsNotEmpty({ message: 'Nama lengkap tidak boleh kosong' })
  fullName: string;

  @ApiPropertyOptional({
    description: 'Nomor telepon / WhatsApp staf',
    example: '+6281234567890',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Kode Staf / NIP / ID Pegawai klinik (otomatis jika kosong)',
    example: 'STF-DOK-099',
  })
  @IsOptional()
  @IsString()
  staffCode?: string;

  @ApiPropertyOptional({
    description: 'Profesi / Jabatan spesifik',
    example: 'Dokter Umum',
  })
  @IsOptional()
  @IsString()
  profession?: string;

  @ApiPropertyOptional({
    description: 'ID Poliklinik / Unit layanan utama',
    example: 'b18b4e7c-b6fa-4993-8025-a13437e2311f',
  })
  @IsOptional()
  @IsString()
  poliklinikId?: string;

  @ApiPropertyOptional({
    description: 'Nomor Izin Praktik (SIP / STR) untuk dokter atau bidan',
    example: 'SIP.446/123/DISKES/2026',
  })
  @IsOptional()
  @IsString()
  licenseNumber?: string;
}
