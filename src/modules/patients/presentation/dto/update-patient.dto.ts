import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePatientDto {
  @ApiPropertyOptional({
    example: 'RM-2026-0001',
    description: 'Nomor rekam medis (MRN)',
  })
  @IsString()
  @IsOptional()
  medicalRecordNumber?: string;

  @ApiPropertyOptional({
    example: 'Budi Santoso',
    description: 'Nama lengkap pasien (canonical)',
  })
  @IsString()
  @IsOptional()
  @MinLength(3)
  fullName?: string;

  @ApiPropertyOptional({
    example: '3201234567890001',
    description: 'Nomor Induk Kependudukan (NIK) 16 digit',
  })
  @IsString()
  @IsOptional()
  @ValidateIf((_o, v) => Boolean(v && typeof v === 'string' && v.trim() !== ''))
  @Matches(/^\d{16}$/, { message: 'NIK harus berupa 16 digit angka' })
  nik?: string;

  @ApiPropertyOptional({
    example: 'Siti Aminah',
    description: 'Nama ibu kandung',
  })
  @IsString()
  @IsOptional()
  motherName?: string;

  @ApiPropertyOptional({
    example: 'Bandung',
    description: 'Kota/kabupaten tempat lahir (camelCase)',
  })
  @IsString()
  @IsOptional()
  birthPlace?: string;

  @ApiPropertyOptional({
    example: '1995-05-12',
    description: 'Tanggal lahir format YYYY-MM-DD (canonical)',
  })
  @IsString()
  @IsOptional()
  @ValidateIf((_o, v) => Boolean(v && typeof v === 'string' && v.trim() !== ''))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal lahir harus YYYY-MM-DD',
  })
  birthDate?: string;

  @ApiPropertyOptional({
    example: 'male',
    enum: ['male', 'female'],
    description: 'Jenis kelamin (kanonikal: male / female)',
  })
  @IsOptional()
  @IsIn(['male', 'female'], {
    message: 'Pilih jenis kelamin valid (male atau female)',
  })
  gender?: 'male' | 'female';

  @ApiPropertyOptional({
    example: 'O',
    description: 'Golongan darah (canonical)',
  })
  @IsString()
  @IsOptional()
  bloodType?: string;

  @ApiPropertyOptional({
    example: '081234567890',
    description: 'Nomor telepon (canonical)',
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Karyawan Swasta',
    description: 'Profesi / pekerjaan pasien',
  })
  @IsString()
  @IsOptional()
  occupation?: string;

  @ApiPropertyOptional({
    example: 'Jl. Dago Asri No. 10, Bandung',
    description: 'Alamat lengkap string terpadu (canonical)',
  })
  @IsString()
  @IsOptional()
  fullAddress?: string;

  @ApiPropertyOptional({
    example: 'Jl. Ir. H. Juanda No. 123, RT 02 / RW 05',
    description: 'Alamat jalan, RT/RW, nomor rumah (canonical)',
  })
  @IsString()
  @IsOptional()
  line1?: string;

  @ApiPropertyOptional({
    example: 'Jawa Barat',
    description: 'Nama provinsi (canonical)',
  })
  @IsString()
  @IsOptional()
  provinceName?: string;

  @ApiPropertyOptional({
    example: '32',
    description: 'Kode identifikasi provinsi (canonical)',
  })
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({
    example: 'Kota Bandung',
    description: 'Nama kabupaten/kota (canonical)',
  })
  @IsString()
  @IsOptional()
  regencyName?: string;

  @ApiPropertyOptional({
    example: '3273',
    description: 'Kode identifikasi kabupaten/kota (canonical)',
  })
  @IsString()
  @IsOptional()
  regencyCode?: string;

  @ApiPropertyOptional({
    example: 'Coblong',
    description: 'Nama kecamatan (canonical)',
  })
  @IsString()
  @IsOptional()
  districtName?: string;

  @ApiPropertyOptional({
    example: '327301',
    description: 'Kode identifikasi kecamatan (canonical)',
  })
  @IsString()
  @IsOptional()
  districtCode?: string;

  @ApiPropertyOptional({
    example: 'Dago',
    description: 'Nama kelurahan/desa (canonical)',
  })
  @IsString()
  @IsOptional()
  villageName?: string;

  @ApiPropertyOptional({
    example: '3273011001',
    description: 'Kode identifikasi kelurahan/desa (canonical)',
  })
  @IsString()
  @IsOptional()
  villageCode?: string;

  @ApiPropertyOptional({
    example: 'Ahmad Fauzi',
    description: 'Nama kontak darurat',
  })
  @IsString()
  @IsOptional()
  emergencyContactName?: string;

  @ApiPropertyOptional({
    example: '081298765432',
    description: 'Nomor telepon kontak darurat',
  })
  @IsString()
  @IsOptional()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({
    example: 'Suami',
    description: 'Hubungan dengan kontak darurat',
  })
  @IsString()
  @IsOptional()
  emergencyContactRelationship?: string;

  @ApiPropertyOptional({
    example: 'Riwayat asma alergi dingin',
    description: 'Catatan ringkas riwayat medis',
  })
  @IsString()
  @IsOptional()
  medicalHistory?: string;

  @ApiPropertyOptional({
    enum: ['active', 'inactive'],
    description: 'Status akun pasien',
  })
  @IsEnum(['active', 'inactive'])
  @IsOptional()
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({
    example: 'https://cdn.amanah.id/avatars/user-123.jpg',
    description: 'URL foto profil avatar pasien',
  })
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
