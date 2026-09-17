import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateLayananDto {
  @ApiPropertyOptional({ example: 'Pembersihan Karang Gigi (Scaling)' })
  @IsString()
  @IsOptional()
  namaLayanan?: string;

  @ApiPropertyOptional({ example: 'Deskripsi layanan baru' })
  @IsString()
  @IsOptional()
  deskripsi?: string;

  @ApiPropertyOptional({
    enum: ['general', 'pregnancy', 'immunization'],
  })
  @IsEnum(['general', 'pregnancy', 'immunization'])
  @IsOptional()
  medicalFlow?: 'general' | 'pregnancy' | 'immunization';

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
