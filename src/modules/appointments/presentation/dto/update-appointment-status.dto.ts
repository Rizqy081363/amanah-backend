import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { AppointmentStatus } from '../../domain/types/appointment.types';

export class UpdateAppointmentStatusDto {
  @ApiProperty({
    enum: [
      'WAITING',
      'IN_SERVICE',
      'COMPLETED',
      'CANCELLED',
      'LATE',
      'SUDAH_BUAT_JANJI',
      'SUDAH_DATANG',
      'MENUNGGU',
      'SEDANG_DIPERIKSA',
      'SELESAI',
      'BATAL',
    ],
    example: 'IN_SERVICE',
    description: 'Status siklus pelayanan antrean dan kunjungan',
  })
  @IsEnum([
    'WAITING',
    'IN_SERVICE',
    'COMPLETED',
    'CANCELLED',
    'LATE',
    'SUDAH_BUAT_JANJI',
    'SUDAH_DATANG',
    'MENUNGGU',
    'SEDANG_DIPERIKSA',
    'SELESAI',
    'BATAL',
  ])
  @IsNotEmpty()
  status: AppointmentStatus | string;

  @ApiPropertyOptional({
    example: 'Pasien tidak hadir',
    description: 'Alasan pembatalan',
  })
  @IsString()
  @IsOptional()
  cancellationReason?: string;
}
