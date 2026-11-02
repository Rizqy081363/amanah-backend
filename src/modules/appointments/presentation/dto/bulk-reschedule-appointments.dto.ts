import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { type CanonicalStaffShift } from '../../../schedules/domain/constants/schedule-shift.constants';

export class BulkRescheduleAppointmentsDto {
  @ApiProperty({
    description: 'Daftar ID unik janji temu pasien (UUID)',
    example: ['6d3a26e2-77fb-466d-9096-d3b2400c443d'],
    type: [String],
  })
  @IsArray({ message: 'appointmentIds harus berupa array UUID' })
  @ArrayNotEmpty({ message: 'appointmentIds tidak boleh kosong' })
  @IsUUID('4', { each: true, message: 'Setiap appointmentId harus berformat UUID v4 valid' })
  appointmentIds: string[];

  @ApiProperty({
    description: 'Tanggal janji temu baru (format YYYY-MM-DD)',
    example: '2026-11-04',
  })
  @IsString()
  @IsNotEmpty({ message: 'targetDate wajib diisi' })
  targetDate: string;

  @ApiPropertyOptional({
    description: 'Kode shift sesi kunjungan baru',
    example: 'morning',
  })
  @IsString()
  @IsOptional()
  session?: CanonicalStaffShift;

  @ApiPropertyOptional({
    description: 'ID sesi definisi tujuan (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  targetSessionId?: string;

  @ApiPropertyOptional({
    description: 'Alasan penjadwalan ulang massal',
    example: 'Penyesuaian jadwal operasional klinik',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
