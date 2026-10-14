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
import { VALID_BLOOD_TYPE_VALUES } from '../../domain/data/patient-reference.data';

export class UpdatePatientDto {
  @ApiPropertyOptional({
    example: 'Budi Santoso',
    description: 'Nama lengkap pasien (camelCase)',
  })
  @IsString()
  @IsOptional()
  @MinLength(3)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'Budi Santoso',
    description: 'Nama lengkap pasien (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  @MinLength(3)
  name?: string;

  @ApiPropertyOptional({
    example: '3201234567890001',
    description: 'Nomor Induk Kependudukan (NIK) 16 digit',
  })
  @IsString()
  @IsOptional()
  @ValidateIf((o, v) => Boolean(v && typeof v === 'string' && v.trim() !== ''))
  @Matches(/^\d{16}$/, { message: 'NIK harus berupa 16 digit angka' })
  nik?: string;

  @ApiPropertyOptional({
    example: 'Siti Aminah',
    description: 'Nama ibu kandung (camelCase)',
  })
  @IsString()
  @IsOptional()
  namaIbuKandung?: string;

  @ApiPropertyOptional({
    example: 'Siti Aminah',
    description: 'Nama ibu kandung (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  nama_ibu_kandung?: string;

  @ApiPropertyOptional({
    example: 'Bandung',
    description: 'Kota/kabupaten tempat lahir (camelCase)',
  })
  @IsString()
  @IsOptional()
  birthPlace?: string;

  @ApiPropertyOptional({
    example: 'Bandung',
    description: 'Kota/kabupaten tempat lahir (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  tempat_lahir?: string;

  @ApiPropertyOptional({
    example: '1995-05-12',
    description: 'Tanggal lahir format YYYY-MM-DD (camelCase)',
  })
  @IsString()
  @IsOptional()
  @ValidateIf((o, v) => Boolean(v && typeof v === 'string' && v.trim() !== ''))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal lahir harus YYYY-MM-DD',
  })
  birthDate?: string;

  @ApiPropertyOptional({
    example: '1995-05-12',
    description: 'Tanggal lahir format YYYY-MM-DD (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  @ValidateIf((o, v) => Boolean(v && typeof v === 'string' && v.trim() !== ''))
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal lahir harus YYYY-MM-DD',
  })
  birth_date?: string;

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
    description: 'Golongan darah (camelCase)',
  })
  @IsOptional()
  @IsIn([...VALID_BLOOD_TYPE_VALUES], {
    message: 'Pilih golongan darah standar atau simbol rhesus yang valid',
  })
  bloodType?: string;

  @ApiPropertyOptional({
    example: 'O',
    description: 'Golongan darah (alias snake_case)',
  })
  @IsOptional()
  @IsIn([...VALID_BLOOD_TYPE_VALUES], {
    message: 'Pilih golongan darah standar atau simbol rhesus yang valid',
  })
  blood_type?: string;

  @ApiPropertyOptional({
    example: '081234567890',
    description: 'Nomor telepon (camelCase)',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({
    example: '081234567890',
    description: 'Nomor telepon (alias)',
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
  pekerjaan?: string;

  @ApiPropertyOptional({
    example: 'Jl. Dago Asri No. 10, Bandung',
    description: 'Alamat lengkap string terpadu',
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({
    example: 'Jl. Ir. H. Juanda No. 123, RT 02 / RW 05',
    description: 'Alamat jalan, RT/RW, nomor rumah (camelCase)',
  })
  @IsString()
  @IsOptional()
  alamatDetail?: string;

  @ApiPropertyOptional({
    example: 'Jl. Ir. H. Juanda No. 123, RT 02 / RW 05',
    description: 'Alamat jalan, RT/RW, nomor rumah (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  alamat_detail?: string;

  @ApiPropertyOptional({
    example: 'Jawa Barat',
    description: 'Nama provinsi',
  })
  @IsString()
  @IsOptional()
  provinsi?: string;

  @ApiPropertyOptional({
    example: '32',
    description: 'Kode identifikasi provinsi (camelCase)',
  })
  @IsString()
  @IsOptional()
  provinsiId?: string;

  @ApiPropertyOptional({
    example: '32',
    description: 'Kode identifikasi provinsi (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  provinsi_id?: string;

  @ApiPropertyOptional({
    example: 'Kota Bandung',
    description: 'Nama kabupaten/kota',
  })
  @IsString()
  @IsOptional()
  kabupaten?: string;

  @ApiPropertyOptional({
    example: '3273',
    description: 'Kode identifikasi kabupaten/kota (camelCase)',
  })
  @IsString()
  @IsOptional()
  kabupatenId?: string;

  @ApiPropertyOptional({
    example: '3273',
    description: 'Kode identifikasi kabupaten/kota (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  kabupaten_id?: string;

  @ApiPropertyOptional({
    example: 'Coblong',
    description: 'Nama kecamatan',
  })
  @IsString()
  @IsOptional()
  kecamatan?: string;

  @ApiPropertyOptional({
    example: '327301',
    description: 'Kode identifikasi kecamatan (camelCase)',
  })
  @IsString()
  @IsOptional()
  kecamatanId?: string;

  @ApiPropertyOptional({
    example: '327301',
    description: 'Kode identifikasi kecamatan (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  kecamatan_id?: string;

  @ApiPropertyOptional({
    example: 'Dago',
    description: 'Nama kelurahan/desa',
  })
  @IsString()
  @IsOptional()
  kelurahan?: string;

  @ApiPropertyOptional({
    example: '3273011001',
    description: 'Kode identifikasi kelurahan/desa (camelCase)',
  })
  @IsString()
  @IsOptional()
  kelurahanId?: string;

  @ApiPropertyOptional({
    example: '3273011001',
    description: 'Kode identifikasi kelurahan/desa (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  kelurahan_id?: string;

  @ApiPropertyOptional({
    example: 'Ahmad Fauzi',
    description: 'Nama kontak darurat (camelCase)',
  })
  @IsString()
  @IsOptional()
  emergencyContactName?: string;

  @ApiPropertyOptional({
    example: 'Ahmad Fauzi',
    description: 'Nama kontak darurat (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  nama_kontak_darurat?: string;

  @ApiPropertyOptional({
    example: '081298765432',
    description: 'Nomor telepon kontak darurat (camelCase)',
  })
  @IsString()
  @IsOptional()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({
    example: '081298765432',
    description: 'Nomor telepon kontak darurat (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  nomor_kontak_darurat?: string;

  @ApiPropertyOptional({
    example: 'Suami',
    description: 'Hubungan dengan kontak darurat (camelCase)',
  })
  @IsString()
  @IsOptional()
  emergencyContactRelationship?: string;

  @ApiPropertyOptional({
    example: 'Suami',
    description: 'Hubungan dengan kontak darurat (alias snake_case)',
  })
  @IsString()
  @IsOptional()
  hubungan_kontak_darurat?: string;

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
