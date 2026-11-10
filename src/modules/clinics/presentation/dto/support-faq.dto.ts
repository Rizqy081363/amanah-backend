import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSupportFaqDto {
  @ApiProperty({
    description: 'Kategori FAQ (misal: general, fasilitas, beranda, tentang-kami, kontak)',
    example: 'fasilitas',
  })
  @IsString()
  @IsNotEmpty({ message: 'Kategori FAQ tidak boleh kosong' })
  category!: string;

  @ApiProperty({
    description: 'Pertanyaan FAQ',
    example: 'Apakah tersedia pemeriksaan USG?',
  })
  @IsString()
  @IsNotEmpty({ message: 'Pertanyaan FAQ tidak boleh kosong' })
  title!: string;

  @ApiProperty({
    description: 'Jawaban FAQ (array string / paragraf)',
    example: [
      'Ya, Klinik Amanah menyediakan fasilitas USG sebagai pemeriksaan penunjang untuk evaluasi kondisi medis.',
    ],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Jawaban FAQ minimal memuat 1 poin solusi' })
  @IsString({ each: true })
  solutionSteps!: string[];

  @ApiPropertyOptional({
    description: 'Daftar rute halaman landing page penempatan FAQ',
    example: ['/fasilitas'],
    default: ['/'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  paths?: string[];

  @ApiPropertyOptional({
    description: 'ID layanan medis terkait (opsional)',
    example: '7897c5ad-1341-4345-a905-b337b71ef756',
  })
  @IsUUID('4', { message: 'ID layanan medis harus berformat UUID v4 valid' })
  @IsOptional()
  serviceId?: string | null;

  @ApiPropertyOptional({
    description: 'ID kelompok layanan terkait (opsional)',
    example: '485a6568-f9c2-46b0-a601-e83a25ff2554',
  })
  @IsUUID('4', { message: 'ID kategori layanan harus berformat UUID v4 valid' })
  @IsOptional()
  categoryId?: string | null;

  @ApiPropertyOptional({
    description: 'Urutan tampilan FAQ',
    example: 1,
    default: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'Status publikasi FAQ',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}

export class UpdateSupportFaqDto {
  @ApiPropertyOptional({ example: 'fasilitas' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ example: 'Apakah tersedia pemeriksaan USG?' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    example: ['Ya, Klinik Amanah menyediakan fasilitas USG...'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  solutionSteps?: string[];

  @ApiPropertyOptional({ example: ['/fasilitas'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  paths?: string[];

  @ApiPropertyOptional({ example: '7897c5ad-1341-4345-a905-b337b71ef756' })
  @IsUUID('4')
  @IsOptional()
  serviceId?: string | null;

  @ApiPropertyOptional({ example: '485a6568-f9c2-46b0-a601-e83a25ff2554' })
  @IsUUID('4')
  @IsOptional()
  categoryId?: string | null;

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

export class SupportFaqResponseDto {
  @ApiProperty({ example: 'cbf5ef0a-5e86-448f-b6fb-e7c67099d5c1' })
  id!: string;

  @ApiProperty({ example: 'general' })
  category!: string;

  @ApiProperty({ example: 'Di mana alamat Klinik Amanah Healthcare?' })
  title!: string;

  @ApiProperty({
    example: [
      'Klinik Amanah HealthCare berlokasi di Jl. Anyelir 1 No.243, Condongcatur.',
    ],
  })
  solutionSteps!: string[];

  @ApiProperty({ example: ['/', '/tentang-kami', '/fasilitas', '/kontak'] })
  paths!: string[];

  @ApiProperty({ example: 1 })
  displayOrder!: number;

  @ApiProperty({ example: true })
  isPublished!: boolean;

  @ApiPropertyOptional({ example: '60884f33-1045-46fd-b434-d7e31db8b865' })
  serviceId?: string | null;

  @ApiPropertyOptional({ example: 'Persalinan 24 Jam' })
  serviceName?: string | null;

  @ApiPropertyOptional({ example: '485a6568-f9c2-46b0-a601-e83a25ff2554' })
  categoryId?: string | null;

  @ApiPropertyOptional({ example: 'Kesehatan Ibu dan Anak' })
  categoryName?: string | null;

  @ApiProperty({ example: '2026-11-10T16:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-11-10T16:00:00.000Z' })
  updatedAt!: string;
}
