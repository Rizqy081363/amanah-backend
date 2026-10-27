import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum StaffOnboardingRole {
  DOCTOR = 'doctor',
  MIDWIFE = 'midwife',
  }

export class AuthStaffOnboardingDto {
  @ApiPropertyOptional({
    description:
      'Pilihan peran klinis (opsional - server akan menggunakan peran undangan/DB jika telah ditetapkan): doctor, midwife, atau worker/staff',
    enum: StaffOnboardingRole,
    example: 'doctor',
  })
  @IsEnum(StaffOnboardingRole, {
    message: 'Peran harus salah satu dari: doctor, midwife, worker, staff',
  })
  @IsOptional()
  role?: StaffOnboardingRole;

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
    description:
      'ID atau kode poliklinik / unit layanan utama. Onboarding mobile menggunakan kode stabil poli_umum atau poli_kia.',
    example: 'poli_umum',
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

  @ApiPropertyOptional({ example: 'Jakarta' })
  @IsOptional()
  @IsString()
  birthPlace?: string;

  @ApiPropertyOptional({ example: '1990-01-01' })
  @IsOptional()
  @IsString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: ['male', 'female'], example: 'male' })
  @IsOptional()
  @IsString()
  gender?: 'male' | 'female';

  @ApiPropertyOptional({ example: '3171234567890001' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({ example: 'Jawa Barat', description: 'Nama provinsi domisili' })
  @IsOptional()
  @IsString()
  provinsi?: string;

  @ApiPropertyOptional({ example: '32', description: 'Kode identifikasi provinsi' })
  @IsOptional()
  @IsString()
  provinsi_id?: string;

  @ApiPropertyOptional({ example: '32', description: 'Alias camelCase kode provinsi' })
  @IsOptional()
  @IsString()
  provinsiId?: string;

  @ApiPropertyOptional({ example: 'Kabupaten Bogor', description: 'Nama kabupaten/kota domisili' })
  @IsOptional()
  @IsString()
  kabupaten?: string;

  @ApiPropertyOptional({ example: '3201', description: 'Kode identifikasi kabupaten/kota' })
  @IsOptional()
  @IsString()
  kabupaten_id?: string;

  @ApiPropertyOptional({ example: '3201', description: 'Alias camelCase kode kabupaten' })
  @IsOptional()
  @IsString()
  kabupatenId?: string;

  @ApiPropertyOptional({ example: 'Cibinong', description: 'Nama kecamatan domisili' })
  @IsOptional()
  @IsString()
  kecamatan?: string;

  @ApiPropertyOptional({ example: '320101', description: 'Kode identifikasi kecamatan' })
  @IsOptional()
  @IsString()
  kecamatan_id?: string;

  @ApiPropertyOptional({ example: '320101', description: 'Alias camelCase kode kecamatan' })
  @IsOptional()
  @IsString()
  kecamatanId?: string;

  @ApiPropertyOptional({ example: 'Pakansari', description: 'Nama kelurahan/desa domisili' })
  @IsOptional()
  @IsString()
  kelurahan?: string;

  @ApiPropertyOptional({ example: '3201012001', description: 'Kode identifikasi kelurahan/desa' })
  @IsOptional()
  @IsString()
  kelurahan_id?: string;

  @ApiPropertyOptional({ example: '3201012001', description: 'Alias camelCase kode kelurahan' })
  @IsOptional()
  @IsString()
  kelurahanId?: string;

  @ApiPropertyOptional({
    example: 'Jl. Raya Tegar Beriman No. 1 RT 01/02',
    description: 'Alamat detail / jalan tempat tinggal',
  })
  @IsOptional()
  @IsString()
  alamat_detail?: string;

  @ApiPropertyOptional({
    example: 'Jl. Raya Tegar Beriman No. 1 RT 01/02',
    description: 'Alias camelCase alamat detail',
  })
  @IsOptional()
  @IsString()
  alamatDetail?: string;

  @ApiPropertyOptional({
    example: 'Jl. Raya Tegar Beriman No. 1 RT 01/02',
    description: 'Alias line1',
  })
  @IsOptional()
  @IsString()
  line1?: string;
}
