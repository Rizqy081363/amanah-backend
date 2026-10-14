import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { VALID_BLOOD_TYPE_VALUES } from '../../domain/data/patient-reference.data';

export class CreatePatientAffiliationDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Patient ID jika menghubungkan profil pasien yang sudah ada',
  })
  @IsString()
  @IsOptional()
  patient_id?: string;

  @ApiProperty({
    example: 'parent',
    enum: ['self', 'parent', 'child', 'spouse', 'relative', 'friend', 'other'],
    description: 'Tipe hubungan keluarga / kerabat',
  })
  @IsNotEmpty({ message: 'Pilih tipe hubungan' })
  @IsIn(['self', 'parent', 'child', 'spouse', 'relative', 'friend', 'other'])
  relationship_type:
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
  relation_label?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Tandai sebagai profil pasien utama akun ini',
  })
  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;

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
  tempat_lahir?: string;

  @ApiPropertyOptional({ example: '1968-05-12' })
  @IsString()
  @IsOptional()
  birth_date?: string;

  @ApiPropertyOptional({
    example: 'Perempuan',
    enum: ['Laki-laki', 'Perempuan', 'L', 'P'],
  })
  @IsOptional()
  @IsIn(['Laki-laki', 'Perempuan', 'L', 'P'])
  gender?: 'Laki-laki' | 'Perempuan' | 'L' | 'P';

  @ApiPropertyOptional({
    example: 'B',
    description: 'Golongan darah afiliasi',
  })
  @IsOptional()
  @IsIn([...VALID_BLOOD_TYPE_VALUES], {
    message: 'Pilih golongan darah standar atau simbol rhesus yang valid',
  })
  blood_type?: string;

  @ApiPropertyOptional({ example: 'Siti Rohmah' })
  @IsString()
  @IsOptional()
  nama_ibu_kandung?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsString()
  @IsOptional()
  occupation_id?: string;

  @ApiPropertyOptional({ example: 'Ibu Rumah Tangga' })
  @IsString()
  @IsOptional()
  pekerjaan?: string;

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
  provinsi?: string;

  @ApiPropertyOptional({ example: '32' })
  @IsString()
  @IsOptional()
  provinsi_id?: string;

  @ApiPropertyOptional({ example: 'Kota Bandung' })
  @IsString()
  @IsOptional()
  kabupaten?: string;

  @ApiPropertyOptional({ example: '3273' })
  @IsString()
  @IsOptional()
  kabupaten_id?: string;

  @ApiPropertyOptional({ example: 'Coblong' })
  @IsString()
  @IsOptional()
  kecamatan?: string;

  @ApiPropertyOptional({ example: '327301' })
  @IsString()
  @IsOptional()
  kecamatan_id?: string;

  @ApiPropertyOptional({ example: 'Dago' })
  @IsString()
  @IsOptional()
  kelurahan?: string;

  @ApiPropertyOptional({ example: '3273011001' })
  @IsString()
  @IsOptional()
  kelurahan_id?: string;

  @ApiPropertyOptional({ example: 'Jl. Dago Asri No. 10' })
  @IsString()
  @IsOptional()
  alamat_detail?: string;
}
