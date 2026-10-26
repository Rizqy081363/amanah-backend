import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class GetAdminDoctorPatientsQueryDto {
  @ApiProperty({
    description: 'Tanggal kalender spesifik (format YYYY-MM-DD)',
    example: '2026-09-24',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'Filter shift sesi praktik',
    example: 'pagi',
  })
  @IsOptional()
  @IsString()
  sessionShift?: string;

  @ApiPropertyOptional({
    description: 'Filter status antrean pasien',
    enum: [
      'waiting',
      'booked',
      'in_service',
      'completed',
      'cancelled',
      'no_show',
      'all',
    ],
    example: 'waiting',
  })
  @IsOptional()
  @IsEnum([
    'waiting',
    'booked',
    'in_service',
    'completed',
    'cancelled',
    'no_show',
    'all',
  ])
  status?: string;

  @ApiPropertyOptional({
    description: 'Pencarian nama pasien atau no rekam medis',
    example: 'Ahmad',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
