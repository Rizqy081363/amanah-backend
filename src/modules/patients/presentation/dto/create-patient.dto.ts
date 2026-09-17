import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
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

  @ApiProperty({ enum: ['Laki-laki', 'Perempuan'], example: 'Perempuan' })
  @IsEnum(['Laki-laki', 'Perempuan'])
  @IsNotEmpty()
  gender: 'Laki-laki' | 'Perempuan';

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

  @ApiProperty({ example: '081234567890' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'Jl. Merdeka No. 45, Bandung' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: 'Siti Aminah' })
  @IsString()
  @IsOptional()
  namaIbuKandung?: string;

  @ApiPropertyOptional({ example: 'Karyawan Swasta' })
  @IsString()
  @IsOptional()
  pekerjaan?: string;

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
