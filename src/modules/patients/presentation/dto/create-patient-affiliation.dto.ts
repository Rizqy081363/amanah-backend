import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreatePatientAffiliationDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Patient ID jika menghubungkan profil pasien yang sudah ada',
  })
  @IsString()
  @IsOptional()
  patientId?: string;

  @ApiProperty({
    example: 'parent',
    enum: ['self', 'parent', 'child', 'spouse', 'relative', 'friend', 'other'],
    description: 'Tipe hubungan keluarga / kerabat',
  })
  @IsNotEmpty({ message: 'Pilih tipe hubungan' })
  @IsIn(['self', 'parent', 'child', 'spouse', 'relative', 'friend', 'other'])
  relationshipType:
    | 'self'
    | 'parent'
    | 'child'
    | 'spouse'
    | 'relative'
    | 'friend'
    | 'other';

  @ApiPropertyOptional({
    example: 'Ibu Kandung',
    description: 'Label panggilan relasi (misal: Ibu, Anak Pertama, Suami)',
  })
  @IsString()
  @IsOptional()
  relationLabel?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Tandai sebagai profil pasien utama akun ini',
  })
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: 'Siti Aminah' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '3201234567890002' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{16}$/, { message: 'NIK harus berupa 16 digit angka' })
  nik?: string;

  @ApiPropertyOptional({ example: 'Bandung' })
  @IsString()
  @IsOptional()
  birthPlace?: string;

  @ApiPropertyOptional({ example: '1968-05-12' })
  @IsString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({
    example: 'female',
    enum: ['male', 'female'],
  })
  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @ApiPropertyOptional({
    example: 'b_positive',
    description: 'Golongan darah afiliasi',
  })
  @IsString()
  @IsOptional()
  bloodType?: string;

  @ApiPropertyOptional({ example: 'Siti Rohmah' })
  @IsString()
  @IsOptional()
  motherName?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsString()
  @IsOptional()
  occupationId?: string;

  @ApiPropertyOptional({ example: 'Ibu Rumah Tangga' })
  @IsString()
  @IsOptional()
  occupation?: string;

  @ApiPropertyOptional({ example: '081234567891' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'keluarga@example.com' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Jawa Barat' })
  @IsString()
  @IsOptional()
  provinceName?: string;

  @ApiPropertyOptional({ example: '32' })
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({ example: 'Kota Bandung' })
  @IsString()
  @IsOptional()
  regencyName?: string;

  @ApiPropertyOptional({ example: '3273' })
  @IsString()
  @IsOptional()
  regencyCode?: string;

  @ApiPropertyOptional({ example: 'Coblong' })
  @IsString()
  @IsOptional()
  districtName?: string;

  @ApiPropertyOptional({ example: '327301' })
  @IsString()
  @IsOptional()
  districtCode?: string;

  @ApiPropertyOptional({ example: 'Dago' })
  @IsString()
  @IsOptional()
  villageName?: string;

  @ApiPropertyOptional({ example: '3273011001' })
  @IsString()
  @IsOptional()
  villageCode?: string;

  @ApiPropertyOptional({ example: 'Jl. Dago Asri No. 10' })
  @IsString()
  @IsOptional()
  line1?: string;
}
