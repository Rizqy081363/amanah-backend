import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateFacilityUnitTypeDto {
  @ApiProperty({
    example: 'Poliklinik Rawat Jalan',
    description: 'Nama master tipe unit',
  })
  @IsString()
  @IsNotEmpty({ message: 'Nama tipe unit tidak boleh kosong' })
  name: string;

  @ApiProperty({
    example: 'poliklinik_rawat_jalan',
    description: 'Kode unik tipe unit (huruf kecil, angka, underscore)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Kode tipe unit tidak boleh kosong' })
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode tipe unit harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code: string;

  @ApiPropertyOptional({ example: 'Unit pelayanan rawat jalan poliklinik' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'building-2', default: 'building-2' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string = 'building-2';

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateFacilityUnitTypeDto {
  @ApiPropertyOptional({ example: 'Poliklinik Rawat Jalan Terpadu' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'rawat_jalan_terpadu' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode tipe unit harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code?: string;

  @ApiPropertyOptional({ example: 'Unit pelayanan rawat jalan terpadu' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'building-2' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateFacilityUnitDto {
  @ApiProperty({
    example: 'Unit Konsultasi 1',
    description: 'Nama unit atau poliklinik',
  })
  @IsString()
  @IsNotEmpty({ message: 'Nama unit tidak boleh kosong' })
  name: string;

  @ApiProperty({
    example: 'unit_konsultasi_1',
    description: 'Kode unik unit (huruf kecil, angka, underscore)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Kode unit tidak boleh kosong' })
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode unit harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code: string;

  @ApiProperty({
    example: 'a0000000-0000-0000-0000-000000000001',
    description: 'ID master tipe unit (UUID v4)',
  })
  @IsUUID('4', { message: 'Unit Type ID harus berupa UUID v4 yang valid' })
  @IsNotEmpty({ message: 'Tipe unit wajib dipilih' })
  unitTypeId: string;

  @ApiPropertyOptional({
    example: 'PU',
    description: 'Prefix nomor antrean tiket',
  })
  @IsString()
  @MaxLength(8)
  @IsOptional()
  queuePrefix?: string;

  @ApiPropertyOptional({ example: 'building-2', default: 'building-2' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string = 'building-2';

  @ApiPropertyOptional({ example: 'Gedung Utama Lantai 1' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateFacilityUnitDto {
  @ApiPropertyOptional({ example: 'Unit Konsultasi Terpadu' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'unit_terpadu' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode unit harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code?: string;

  @ApiPropertyOptional({
    example: 'a0000000-0000-0000-0000-000000000001',
    description: 'ID master tipe unit (UUID v4)',
  })
  @IsUUID('4', { message: 'Unit Type ID harus berupa UUID v4 yang valid' })
  @IsOptional()
  unitTypeId?: string;

  @ApiPropertyOptional({ example: 'PU' })
  @IsString()
  @MaxLength(8)
  @IsOptional()
  queuePrefix?: string;

  @ApiPropertyOptional({ example: 'building-2' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string;

  @ApiPropertyOptional({ example: 'Gedung Utama Lantai 1' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateFacilityRoomDto {
  @ApiProperty({ description: 'ID unit induk (UUID)' })
  @IsUUID('4', { message: 'Unit ID harus berupa UUID v4 yang valid' })
  @IsNotEmpty()
  unitId: string;

  @ApiProperty({ example: 'Ruang Periksa 1' })
  @IsString()
  @IsNotEmpty({ message: 'Nama ruangan tidak boleh kosong' })
  name: string;

  @ApiProperty({ example: 'room_pu_1' })
  @IsString()
  @IsNotEmpty({ message: 'Kode ruangan tidak boleh kosong' })
  code: string;

  @ApiPropertyOptional({ example: 'Samping Ruang Tindakan' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateFacilityRoomDto {
  @ApiPropertyOptional({ description: 'ID unit induk (UUID)' })
  @IsUUID('4')
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ example: 'Ruang Periksa 1 (Utama)' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'room_pu_1' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'Samping Ruang Tindakan' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @IsOptional()
  floor?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateServiceCategoryDto {
  @ApiPropertyOptional({
    description: 'ID poliklinik / unit terafiliasi (UUID)',
  })
  @IsUUID('4')
  @IsOptional()
  unitId?: string;

  @ApiProperty({ example: 'Layanan Pemeriksaan Umum' })
  @IsString()
  @IsNotEmpty({ message: 'Nama kategori tidak boleh kosong' })
  name: string;

  @ApiProperty({ example: 'layanan_umum' })
  @IsString()
  @IsNotEmpty({ message: 'Kode kategori tidak boleh kosong' })
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode kategori harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code: string;

  @ApiPropertyOptional({ example: 'UM' })
  @IsString()
  @MaxLength(8)
  @IsOptional()
  codePrefix?: string;

  @ApiPropertyOptional({ example: 'folder', default: 'folder' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string = 'folder';

  @ApiPropertyOptional({ example: 'Kategori seluruh layanan dokter umum' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number = 0;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateServiceCategoryDto {
  @ApiPropertyOptional({
    description: 'ID poliklinik / unit terafiliasi (UUID)',
  })
  @IsUUID('4')
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ example: 'Layanan Pemeriksaan Umum' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'layanan_umum' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode kategori harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code?: string;

  @ApiPropertyOptional({ example: 'UM' })
  @IsString()
  @MaxLength(8)
  @IsOptional()
  codePrefix?: string;

  @ApiPropertyOptional({ example: 'folder' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string;

  @ApiPropertyOptional({ example: 'Kategori seluruh layanan dokter umum' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateClinicalIntakeFormDto {
  @ApiProperty({
    example: 'pregnancy',
    description:
      'Kode unik formulir (contoh: general, pregnancy, immunization, dental_screening)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Kode formulir tidak boleh kosong' })
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode formulir harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code: string;

  @ApiProperty({ example: 'Pemeriksaan Ibu Hamil & ANC' })
  @IsString()
  @IsNotEmpty({ message: 'Nama formulir tidak boleh kosong' })
  name: string;

  @ApiPropertyOptional({
    example: 'Formulir anamnesis dan riwayat kehamilan/ANC',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'clipboard-list', default: 'clipboard-list' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string = 'clipboard-list';

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}

export class UpdateClinicalIntakeFormDto {
  @ApiPropertyOptional({ example: 'pregnancy' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode formulir harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code?: string;

  @ApiPropertyOptional({ example: 'Pemeriksaan Ibu Hamil & ANC Terpadu' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: 'Formulir anamnesis dan riwayat kehamilan/ANC',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'clipboard-list' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateClinicServiceDto {
  @ApiProperty({ description: 'ID kategori layanan (UUID)' })
  @IsUUID('4', { message: 'Category ID harus berupa UUID v4 yang valid' })
  @IsNotEmpty()
  serviceCategoryId: string;

  @ApiPropertyOptional({ description: 'ID spesialisasi medis (UUID)' })
  @IsUUID('4')
  @IsOptional()
  specialtyId?: string;

  @ApiPropertyOptional({
    description: 'ID formulir rekam medis / intake yang wajib diisi (UUID)',
  })
  @IsUUID('4')
  @IsOptional()
  intakeFormId?: string | null;

  @ApiProperty({ example: 'Pemeriksaan Dokter Umum' })
  @IsString()
  @IsNotEmpty({ message: 'Nama layanan tidak boleh kosong' })
  name: string;

  @ApiProperty({ example: 'pemeriksaan_dokter_umum' })
  @IsString()
  @IsNotEmpty({ message: 'Kode layanan tidak boleh kosong' })
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode layanan harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code: string;

  @ApiPropertyOptional({ example: 'Periksa Umum' })
  @IsString()
  @IsOptional()
  shortName?: string;

  @ApiPropertyOptional({
    example: 'Pemeriksaan fisik dan konsultasi keluhan umum',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'UM', description: 'Prefix antrean layanan' })
  @IsString()
  @IsNotEmpty({ message: 'Code prefix tidak boleh kosong' })
  @MaxLength(8)
  codePrefix: string;

  @ApiPropertyOptional({ example: 'stethoscope', default: 'stethoscope' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string = 'stethoscope';

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number = 0;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isBookable?: boolean = true;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;

  @ApiPropertyOptional({
    description: 'Daftar keluhan awal bawaan untuk layanan ini',
    type: [String],
    example: ['Demam dan batuk', 'Pusing berputar'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  complaints?: string[];
}

export class UpdateClinicServiceDto {
  @ApiPropertyOptional({ description: 'ID kategori layanan (UUID)' })
  @IsUUID('4')
  @IsOptional()
  serviceCategoryId?: string;

  @ApiPropertyOptional({ description: 'ID spesialisasi medis (UUID)' })
  @IsUUID('4')
  @IsOptional()
  specialtyId?: string;

  @ApiPropertyOptional({
    description: 'ID formulir rekam medis / intake yang wajib diisi (UUID)',
  })
  @IsUUID('4')
  @IsOptional()
  intakeFormId?: string | null;

  @ApiPropertyOptional({ example: 'Pemeriksaan Dokter Umum' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'pemeriksaan_dokter_umum' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'Kode layanan harus diawali huruf kecil dan hanya berisi huruf, angka, atau underscore',
  })
  code?: string;

  @ApiPropertyOptional({ example: 'Periksa Umum' })
  @IsString()
  @IsOptional()
  shortName?: string;

  @ApiPropertyOptional({
    example: 'Pemeriksaan fisik dan konsultasi keluhan umum',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'UM' })
  @IsString()
  @MaxLength(8)
  @IsOptional()
  codePrefix?: string;

  @ApiPropertyOptional({ example: 'stethoscope' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  iconName?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isBookable?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Daftar keluhan awal bawaan untuk layanan ini',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  complaints?: string[];
}
