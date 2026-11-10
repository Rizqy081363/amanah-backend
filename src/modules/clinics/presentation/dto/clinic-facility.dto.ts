import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateClinicFacilityDto {
  @ApiProperty({
    description: 'Nama / judul fasilitas',
    example: 'Ruang Persalinan 24 Jam',
  })
  @IsString()
  @IsNotEmpty({ message: 'Judul fasilitas tidak boleh kosong' })
  title!: string;

  @ApiPropertyOptional({
    description: 'Slug unik fasilitas (otomatis di-generate jika kosong)',
    example: 'ruang-persalinan',
  })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({
    description: 'Ringkasan / deskripsi singkat fasilitas',
    example: 'Siaga setiap saat untuk mendampingi proses melahirkan dengan aman.',
  })
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiPropertyOptional({
    description: 'URL gambar fasilitas (direct URL eksternal atau path disk lokal)',
    example: '/healthcare/assets/images/asset-index-8.webp',
  })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'URL tujuan CTA (default: /kontak)',
    example: '/kontak',
  })
  @IsString()
  @IsOptional()
  ctaUrl?: string;

  @ApiPropertyOptional({
    description: 'ID layanan medis terkait (opsional)',
    example: '60884f33-1045-46fd-b434-d7e31db8b865',
  })
  @IsUUID('4', { message: 'ID layanan medis harus berformat UUID v4 valid' })
  @IsOptional()
  serviceId?: string | null;

  @ApiPropertyOptional({
    description: 'Urutan tampilan kartu (semakin kecil semakin awal)',
    example: 1,
    default: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Status publikasi di landing page',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

export class UpdateClinicFacilityDto {
  @ApiPropertyOptional({ example: 'Ruang Persalinan 24 Jam' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'ruang-persalinan' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: 'Deskripsi fasilitas...' })
  @IsString()
  @IsOptional()
  summary?: string;

  @ApiPropertyOptional({ example: '/healthcare/assets/images/asset-index-8.webp' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ example: '/kontak' })
  @IsString()
  @IsOptional()
  ctaUrl?: string;

  @ApiPropertyOptional({ example: '60884f33-1045-46fd-b434-d7e31db8b865' })
  @IsUUID('4')
  @IsOptional()
  serviceId?: string | null;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

export class ClinicFacilityResponseDto {
  @ApiProperty({ example: '86357bcb-3851-4424-8ec3-f65442917830' })
  id!: string;

  @ApiProperty({ example: 'ruang-persalinan' })
  slug!: string;

  @ApiProperty({ example: 'Ruang Persalinan 24 Jam' })
  title!: string;

  @ApiPropertyOptional({ example: 'Siaga setiap saat...' })
  summary?: string | null;

  @ApiPropertyOptional({ example: '/healthcare/assets/images/asset-index-8.webp' })
  imageUrl?: string | null;

  @ApiProperty({ example: '/kontak' })
  ctaUrl!: string;

  @ApiProperty({ example: 1 })
  displayOrder!: number;

  @ApiProperty({ example: true })
  isPublished!: boolean;

  @ApiPropertyOptional({ example: '60884f33-1045-46fd-b434-d7e31db8b865' })
  serviceId?: string | null;

  @ApiPropertyOptional({ example: 'Persalinan 24 Jam' })
  serviceName?: string | null;

  @ApiProperty({ example: '2026-11-10T16:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-11-10T16:00:00.000Z' })
  updatedAt!: string;
}
