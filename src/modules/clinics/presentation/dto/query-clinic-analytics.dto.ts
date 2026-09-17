import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class QueryClinicAnalyticsDto {
  @ApiPropertyOptional({
    example: 2026,
    description: 'Tahun agregasi statistik (default: tahun berjalan)',
  })
  @Transform(({ value }) => (value ? Number(value) : undefined))
  @IsNumber()
  @IsOptional()
  year?: number;

  @ApiPropertyOptional({
    example: 'POLI-ANAK',
    description: 'ID atau kode unit poliklinik untuk filter statistik spesifik',
  })
  @IsString()
  @IsOptional()
  poliklinikId?: string;
}
