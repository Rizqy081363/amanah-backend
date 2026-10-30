import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateLayananDto {
  @ApiPropertyOptional({ example: 'Pembersihan Karang Gigi (Scaling)' })
  @IsString()
  @IsOptional()
  namaLayanan?: string;

  @ApiPropertyOptional({ example: 'Deskripsi layanan baru' })
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

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
