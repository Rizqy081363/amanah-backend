import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLayananDto {
  @ApiProperty({ example: 'Konsultasi Gigi', description: 'Nama Layanan' })
  @IsString()
  @IsNotEmpty()
  namaLayanan: string;

  @ApiPropertyOptional({ example: 'Pemeriksaan rutin kesehatan gigi' })
  @IsString()
  @IsOptional()
  deskripsi?: string;

  @ApiPropertyOptional({
    enum: ['general', 'pregnancy', 'immunization'],
    default: 'general',
  })
  @IsEnum(['general', 'pregnancy', 'immunization'])
  @IsOptional()
  medicalFlow?: 'general' | 'pregnancy' | 'immunization' = 'general';
}
