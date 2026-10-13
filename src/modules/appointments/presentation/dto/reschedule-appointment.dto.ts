import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RescheduleAppointmentDto {
  @ApiPropertyOptional({
    example: 'MALAM',
    description: 'Nama sesi kunjungan baru (PAGI, SIANG, MALAM, DINI_HARI)',
  })
  @IsString()
  @IsOptional()
  session?: string;

  @ApiPropertyOptional({
    example: 'MALAM',
    description: 'Nama sesi tujuan (snake_case alias)',
  })
  @IsString()
  @IsOptional()
  target_session?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID sesi jadwal dokter tujuan (snake_case)',
  })
  @IsString()
  @IsOptional()
  target_session_id?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID sesi jadwal dokter tujuan (camelCase)',
  })
  @IsString()
  @IsOptional()
  newSessionId?: string;

  @ApiPropertyOptional({
    example: '2026-09-29',
    description: 'Tanggal janji temu baru (format YYYY-MM-DD, snake_case)',
  })
  @IsString()
  @IsOptional()
  target_date?: string;

  @ApiPropertyOptional({
    example: '2026-09-29',
    description: 'Tanggal janji temu baru (format YYYY-MM-DD, camelCase)',
  })
  @IsString()
  @IsOptional()
  newDate?: string;

  @ApiPropertyOptional({
    example: '08:00:00',
    description: 'Waktu mulai janji temu baru',
  })
  @IsString()
  @IsOptional()
  target_start_time?: string;

  @ApiPropertyOptional({
    example: '12:00:00',
    description: 'Waktu selesai janji temu baru',
  })
  @IsString()
  @IsOptional()
  target_end_time?: string;

  @ApiPropertyOptional({
    example: 'Ada keperluan mendadak di pagi hari',
    description: 'Alasan pengajuan reschedule',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
