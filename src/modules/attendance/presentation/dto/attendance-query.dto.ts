import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AttendanceQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-18',
    description: 'Tanggal rekapitulasi presensi (YYYY-MM-DD)',
  })
  @IsString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    example: 'morning',
    description: 'Filter shift (early_morning, morning, afternoon, night, atau all)',
  })
  @IsString()
  @IsOptional()
  shift?: string;

  @ApiPropertyOptional({
    example: 'present',
    description: 'Filter status presensi (present, late, absent, leave, missed, atau all)',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    example: 'doctor',
    description: 'Filter kategori profesi (doctor, midwife, worker, atau all)',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    example: 'Dimas',
    description: 'Pencarian nama staf atau ID/kode staf',
  })
  @IsString()
  @IsOptional()
  search?: string;
}
