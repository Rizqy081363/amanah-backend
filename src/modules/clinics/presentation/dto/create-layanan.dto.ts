import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLayananDto {
  @ApiProperty({ example: 'Konsultasi Gigi', description: 'Nama Layanan' })
  @IsString()
  @IsNotEmpty()
  namaLayanan: string;

  @ApiPropertyOptional({ example: 'Pemeriksaan rutin kesehatan gigi' })
  @IsString()
  @IsOptional()
  deskripsi?: string;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID formulir intake (UUID)' })
  @IsString()
  @IsOptional()
  intakeFormId?: string;

  @ApiPropertyOptional({
    description: 'Kode alur medis klinis dinamis',
    example: 'general',
  })
  @IsString()
  @IsOptional()
  medicalFlow?: string;
}
