import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ScheduleOperationalStatus } from '../../domain/entities/schedule.entity';

export class AdminDoctorSchedulesQueryDto {
  @ApiPropertyOptional({
    description: 'Halaman aktif (1-indexed)',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Jumlah dokter per halaman (6, 12, 18, 24, 30)',
    default: 6,
    example: 6,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 6;

  @ApiPropertyOptional({
    description:
      'Kata kunci pencarian (nama dokter, spesialisasi, atau ruangan)',
    example: 'Sarah',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter nama poli atau spesialisasi (bisa koma jika multi)',
    example: 'Penyakit Dalam',
  })
  @IsOptional()
  @IsString()
  poli?: string;

  @ApiPropertyOptional({
    description:
      'Filter canonical effective schedule status. Comma-separated values are allowed.',
    enum: ScheduleOperationalStatus,
    example: ScheduleOperationalStatus.OPEN,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter bulan (format YYYY-MM)',
    example: '2026-09',
  })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({
    description: 'Tanggal evaluasi jadwal dokter (format YYYY-MM-DD)',
    example: '2026-09-22',
  })
  @IsOptional()
  @IsString()
  date?: string;
}
