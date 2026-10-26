import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({
    example: '3201234567890001',
    description: '16 digit NIK KTP Pasien',
  })
  @IsString()
  @IsNotEmpty()
  @Length(16, 16, { message: 'NIK harus berupa 16 digit angka' })
  nik: string;

  @ApiProperty({ example: 'Dewi Lestari', description: 'Nama Lengkap Pasien' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ enum: ['male', 'female'], example: 'female' })
  @IsIn(['male', 'female'])
  @IsNotEmpty()
  gender: 'male' | 'female';

  @ApiProperty({ example: '1995-05-12', description: 'Format YYYY-MM-DD' })
  @IsString()
  @IsNotEmpty()
  birthDate: string;

  @ApiPropertyOptional({ example: 'Bandung' })
  @IsString()
  @IsOptional()
  birthPlace?: string;

  @ApiPropertyOptional({ example: 'O', description: 'Golongan Darah' })
  @IsString()
  @IsOptional()
  bloodType?: string;

  @ApiProperty({ example: '081234567890', description: 'Nomor telepon pasien' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    example: 'Jl. Merdeka No. 45',
    description: 'Baris alamat jalan (nama jalan, nomor rumah)',
  })
  @IsString()
  @IsNotEmpty()
  line1: string;

  @ApiPropertyOptional({
    example: 'Jawa Barat',
    description: 'Nama provinsi domisili',
  })
  @IsString()
  @IsOptional()
  provinceName?: string;

  @ApiPropertyOptional({
    example: '32',
    description: 'Kode identifikasi provinsi',
  })
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({
    example: 'Kota Bandung',
    description: 'Nama kota atau kabupaten domisili',
  })
  @IsString()
  @IsOptional()
  regencyName?: string;

  @ApiPropertyOptional({
    example: '3273',
    description: 'Kode identifikasi kabupaten/kota',
  })
  @IsString()
  @IsOptional()
  regencyCode?: string;

  @ApiPropertyOptional({
    example: 'Coblong',
    description: 'Nama kecamatan domisili',
  })
  @IsString()
  @IsOptional()
  districtName?: string;

  @ApiPropertyOptional({
    example: '327301',
    description: 'Kode identifikasi kecamatan',
  })
  @IsString()
  @IsOptional()
  districtCode?: string;

  @ApiPropertyOptional({
    example: 'Dago',
    description: 'Nama kelurahan atau desa domisili',
  })
  @IsString()
  @IsOptional()
  villageName?: string;

  @ApiPropertyOptional({
    example: '3273011001',
    description: 'Kode identifikasi kelurahan/desa',
  })
  @IsString()
  @IsOptional()
  villageCode?: string;

  @ApiPropertyOptional({ example: 'Siti Aminah' })
  @IsString()
  @IsOptional()
  motherName?: string;

  @ApiPropertyOptional({ example: 'Karyawan Swasta' })
  @IsString()
  @IsOptional()
  occupation?: string;

  @ApiPropertyOptional({ example: 'Tidak ada riwayat alergi berat' })
  @IsString()
  @IsOptional()
  medicalHistory?: string;

  @ApiPropertyOptional({
    description: 'ID User jika sudah memiliki akun login',
  })
  @IsString()
  @IsOptional()
  userId?: string;
}
