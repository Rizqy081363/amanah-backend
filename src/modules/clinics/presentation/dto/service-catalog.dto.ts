import { ApiProperty } from '@nestjs/swagger';

export class ServiceCatalogItemDto {
  @ApiProperty({
    description: 'ID layanan unik (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  id: string;

  @ApiProperty({ description: 'Kode unik layanan', example: 'usg_umum' })
  code: string;

  @ApiProperty({ description: 'Nama layanan', example: 'USG Umum' })
  name: string;

  @ApiProperty({ description: 'Prefix kode antrean layanan', example: 'USG' })
  prefix: string;

  @ApiProperty({
    description: 'Deskripsi layanan',
    required: false,
    nullable: true,
  })
  description?: string | null;

  @ApiProperty({
    description: 'URL gambar thumbnail layanan',
    required: false,
    nullable: true,
  })
  imageUrl?: string | null;

  @ApiProperty({
    description: 'Kode spesialisasi',
    example: 'general_practitioner',
    nullable: true,
  })
  specialtyCode?: string | null;

  @ApiProperty({
    description: 'Alur medis klinis',
    example: 'general',
    nullable: true,
  })
  medicalFlow?: 'general' | 'pregnancy' | 'immunization' | null;

  @ApiProperty({ description: 'Urutan tampilan', example: 1 })
  displayOrder: number;

  @ApiProperty({
    description: 'ID poliklinik tujuan',
    example: '53fa8088-46c8-4611-9dea-99a54f4a45ab',
  })
  poliklinikId: string;

  @ApiProperty({ description: 'Nama poliklinik', example: 'Poli Umum' })
  poliklinikName: string;

  @ApiProperty({
    description: 'Daftar pilihan keluhan utama bawaan',
    type: [String],
    example: ['Demam dan menggigil', 'Flu, batuk, dan pilek'],
  })
  complaints: string[];
}

export class ServiceCategoryCatalogDto {
  @ApiProperty({
    description: 'ID kategori layanan unik (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  id: string;

  @ApiProperty({ description: 'Kode kategori', example: 'layanan_umum' })
  code: string;

  @ApiProperty({
    description: 'Nama kategori layanan',
    example: 'Layanan Umum',
  })
  name: string;

  @ApiProperty({
    description: 'Deskripsi kategori',
    required: false,
    nullable: true,
  })
  description?: string | null;

  @ApiProperty({ description: 'Urutan tampilan', example: 1 })
  displayOrder: number;

  @ApiProperty({
    description: 'ID poliklinik induk',
    example: '53fa8088-46c8-4611-9dea-99a54f4a45ab',
  })
  poliklinikId: string;

  @ApiProperty({ description: 'Nama poliklinik induk', example: 'Poli Umum' })
  poliklinikName: string;

  @ApiProperty({
    description: 'Daftar layanan di dalam kategori',
    type: [ServiceCatalogItemDto],
  })
  services: ServiceCatalogItemDto[];
}

export class ServiceCatalogResponseDto {
  @ApiProperty({ description: 'Status keberhasilan', example: true })
  success: boolean;

  @ApiProperty({
    description: 'Daftar seluruh kategori dan layanan klinik',
    type: [ServiceCategoryCatalogDto],
  })
  categories: ServiceCategoryCatalogDto[];
}
