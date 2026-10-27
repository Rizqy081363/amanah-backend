import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  CANONICAL_STAFF_SHIFTS,
  type CanonicalStaffShift,
} from '../../../schedules/domain/constants/schedule-shift.constants';
import type { RescheduleAppointmentInput } from './reschedule-appointment.schema';

export class RescheduleAppointmentDto implements RescheduleAppointmentInput {
  @ApiPropertyOptional({
    enum: CANONICAL_STAFF_SHIFTS,
    example: 'morning',
    description:
      'Nama shift sesi kunjungan baru (early_morning, morning, afternoon, night)',
  })
  @IsString()
  @IsOptional()
  session?: CanonicalStaffShift;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID sesi definisi tujuan',
  })
  @IsString()
  @IsOptional()
  target_session_id?: string;

  @ApiProperty({
    example: '2026-09-29',
    description: 'Tanggal janji temu baru (format YYYY-MM-DD)',
  })
  @IsString()
  @IsNotEmpty()
  target_date: string;

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
    example: 'Ada keperluan mendadak',
    description: 'Alasan pengajuan reschedule',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
