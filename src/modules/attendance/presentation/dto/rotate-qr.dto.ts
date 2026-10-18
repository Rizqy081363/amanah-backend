import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class RotateQrDto {
  @ApiPropertyOptional({
    example: 'location_check_in',
    description: 'Tipe sesi QR (location_check_in atau staff_identity)',
  })
  @IsString()
  @IsOptional()
  sessionType?: string;

  @ApiPropertyOptional({
    example: 'morning',
    description: 'Sesi giliran dinas aktif',
  })
  @IsString()
  @IsOptional()
  shift?: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Durasi rotasi QR token dalam detik',
  })
  @IsNumber()
  @IsOptional()
  rotationSeconds?: number;

  @ApiPropertyOptional({
    example: 'Terminal Resepsionis Utama',
    description: 'Konteks atau lokasi penempatan terminal QR',
  })
  @IsString()
  @IsOptional()
  context?: string;
}
