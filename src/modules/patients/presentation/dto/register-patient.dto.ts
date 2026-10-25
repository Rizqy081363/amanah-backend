import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterPatientDto {
  @ApiProperty({
    example: 'Budi Santoso',
    description: 'Nama lengkap pasien sesuai identitas KTP',
    minLength: 3,
  })
  @IsString({ message: 'Nama lengkap harus berupa teks' })
  @IsNotEmpty({ message: 'Nama lengkap tidak boleh kosong' })
  @MinLength(3, { message: 'Nama lengkap minimal 3 karakter' })
  name: string;

  @ApiProperty({
    example: '3201234567890001',
    description: 'Nomor Induk Kependudukan (NIK) 16 digit angka',
  })
  @IsString({ message: 'NIK harus berupa teks numerik' })
  @IsNotEmpty({ message: 'NIK tidak boleh kosong' })
  @Matches(/^\d{16}$/, { message: 'NIK harus berupa 16 digit angka' })
  nik: string;

  @ApiProperty({
    example: 'Siti Aminah',
    description: 'Nama ibu kandung pasien untuk verifikasi rekam medis',
    minLength: 3,
  })
  @IsString({ message: 'Nama ibu kandung harus berupa teks' })
  @IsNotEmpty({ message: 'Nama ibu kandung tidak boleh kosong' })
  @MinLength(3, { message: 'Nama ibu kandung minimal 3 karakter' })
  motherName: string;

  @ApiProperty({
    example: 'Bandung',
    description: 'Kota atau kabupaten tempat lahir pasien',
    minLength: 2,
  })
  @IsString({ message: 'Tempat lahir harus berupa teks' })
  @IsNotEmpty({ message: 'Tempat lahir tidak boleh kosong' })
  @MinLength(2, { message: 'Tempat lahir minimal 2 karakter' })
  birthPlace: string;

  @ApiProperty({
    example: '1995-05-12',
    description: 'Tanggal lahir pasien dengan format ISO YYYY-MM-DD',
  })
  @IsString({ message: 'Tanggal lahir harus berupa teks' })
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({ example: '1995-05-12' })
  @IsString()
  @IsOptional()
  birth_date?: string;

  @ApiProperty({
    example: 'male',
    enum: ['male', 'female'],
    description: 'Jenis kelamin pasien (kanonikal: male / female)',
  })
  @IsNotEmpty({ message: 'Pilih jenis kelamin' })
  @IsIn(['male', 'female'], {
    message: 'Pilih jenis kelamin valid (male atau female)',
  })
  gender: 'male' | 'female';

  @ApiProperty({
    example: 'O',
    description: 'Golongan darah pasien',
  })
  @IsString({ message: 'Golongan darah harus berupa teks' })
  @IsNotEmpty({ message: 'Pilih golongan darah' })
  blood_type: string;

  @ApiProperty({ example: 'Jawa Barat', description: 'Nama provinsi domisili' })
  @IsString()
  @IsNotEmpty({ message: 'Pilih provinsi domisili' })
  provinceName: string;

  @ApiProperty({ example: '32', description: 'Kode identifikasi provinsi' })
  @IsString()
  @IsNotEmpty({ message: 'Kode provinsi tidak boleh kosong' })
  provinceCode: string;

  @ApiProperty({
    example: 'Kota Bandung',
    description: 'Nama kota atau kabupaten domisili',
  })
  @IsString()
  @IsNotEmpty({ message: 'Pilih kota atau kabupaten domisili' })
  regencyName: string;

  @ApiProperty({
    example: '3273',
    description: 'Kode identifikasi kabupaten/kota',
  })
  @IsString()
  @IsNotEmpty({ message: 'Kode kabupaten tidak boleh kosong' })
  regencyCode: string;

  @ApiProperty({
    example: 'Coblong',
    description: 'Nama kecamatan domisili',
  })
  @IsString()
  @IsNotEmpty({ message: 'Pilih kecamatan domisili' })
  districtName: string;

  @ApiProperty({
    example: '327301',
    description: 'Kode identifikasi kecamatan',
  })
  @IsString()
  @IsNotEmpty({ message: 'Kode kecamatan tidak boleh kosong' })
  districtCode: string;

  @ApiProperty({
    example: 'Dago',
    description: 'Nama kelurahan atau desa domisili',
  })
  @IsString()
  @IsNotEmpty({ message: 'Pilih kelurahan atau desa domisili' })
  villageName: string;

  @ApiProperty({
    example: '3273011001',
    description: 'Kode identifikasi kelurahan/desa',
  })
  @IsString()
  @IsNotEmpty({ message: 'Kode kelurahan tidak boleh kosong' })
  villageCode: string;

  @ApiProperty({
    example: 'Jl. Ir. H. Juanda No. 123, RT 02 / RW 05',
    description:
      'Alamat detail (nama jalan, RT/RW, nomor rumah atau gedung domisili)',
    minLength: 5,
  })
  @IsString({ message: 'Alamat detail harus berupa teks' })
  @IsNotEmpty({ message: 'Alamat detail tidak boleh kosong' })
  @MinLength(5, { message: 'Alamat detail minimal 5 karakter' })
  line1: string;

  @ApiProperty({
    example: 'Karyawan Swasta',
    description: 'Profesi atau jenis pekerjaan pasien saat ini',
    minLength: 2,
  })
  @IsString({ message: 'Pekerjaan harus berupa teks' })
  @IsNotEmpty({ message: 'Pekerjaan tidak boleh kosong' })
  @MinLength(2, { message: 'Pekerjaan minimal 2 karakter' })
  occupation: string;

  @ApiPropertyOptional({
    example: '081234567890',
    description: 'Nomor telepon atau WhatsApp pasien (opsional)',
  })
  @IsString()
  @IsOptional()
  phone?: string;
}
