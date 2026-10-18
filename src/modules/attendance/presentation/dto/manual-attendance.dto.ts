import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ManualAttendanceDto {
  @ApiProperty({
    example: 'STF-WRK-001',
    description: 'ID profil staf atau Staff Code resmi',
  })
  @IsString()
  @IsNotEmpty()
  staffIdOrCode: string;

  @ApiPropertyOptional({
    example: 'morning',
    description: 'Sesi shift kerja (early_morning, morning, afternoon, night)',
  })
  @IsString()
  @IsOptional()
  shift?: string;

  @ApiPropertyOptional({
    example: 'present',
    description: 'Status kehadiran (present, late, absent, leave, missed)',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    example: '2026-10-18',
    description: 'Tanggal presensi (YYYY-MM-DD)',
  })
  @IsString()
  @IsOptional()
  attendanceDate?: string;

  @ApiPropertyOptional({
    example: 'Presensi manual dicatat oleh admin operasional',
    description: 'Catatan tambahan atau alasan input manual',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
