import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { AppointmentStatus } from '../../domain/types/appointment.types';

export class UpdateAppointmentStatusDto {
  @ApiProperty({
    enum: [
      'BOOKED',
      'WAITING',
      'IN_SERVICE',
      'COMPLETED',
      'CANCELLED',
      'LATE',
      'NO_SHOW',
    ],
    example: 'IN_SERVICE',
    description: 'Status kanonikal siklus pelayanan antrean dan kunjungan',
  })
  @IsEnum([
    'BOOKED',
    'WAITING',
    'IN_SERVICE',
    'COMPLETED',
    'CANCELLED',
    'LATE',
    'NO_SHOW',
  ])
  @IsNotEmpty()
  status: AppointmentStatus;

  @ApiPropertyOptional({
    example: 'Pasien tidak hadir',
    description: 'Alasan pembatalan atau perubahan status',
  })
  @IsString()
  @IsOptional()
  cancellationReason?: string;
}
