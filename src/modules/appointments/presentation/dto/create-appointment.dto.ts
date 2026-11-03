import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { type CanonicalStaffShift } from '../../../schedules/domain/constants/schedule-shift.constants';
import type { CreateAppointmentInput } from './create-appointment.schema';

export class CreateAppointmentDto implements CreateAppointmentInput {
  @ApiPropertyOptional({
    description:
      'ID Pasien. Jika tidak diisi, otomatis menggunakan ID pasien dari user yang sedang login',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiProperty({
    description: 'ID Unit Poliklinik tujuan (UUID dari clinic_units)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsUUID()
  @IsNotEmpty()
  poliklinikId: string;

  @ApiProperty({
    description: 'ID services yang dipilih',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsUUID()
  @IsNotEmpty()
  layananId: string;

  @ApiPropertyOptional({
    description: 'ID Staf Dokter tertentu jika memilih dokter spesifik',
  })
  @IsUUID()
  @IsOptional()
  staffId?: string;

  @ApiProperty({
    description: 'Tanggal rencana kunjungan (YYYY-MM-DD)',
    example: '2026-09-18',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'appointmentDate harus berformat YYYY-MM-DD',
  })
  @IsNotEmpty()
  appointmentDate: string;

  @ApiProperty({
    example: 'morning',
    description: 'Sesi giliran kunjungan',
  })
  @IsString()
  @IsNotEmpty()
  session: CanonicalStaffShift;

  @ApiProperty({
    enum: ['new_visit', 'follow_up'],
    example: 'new_visit',
    description: 'Tipe kunjungan (new_visit / follow_up)',
  })
  @IsIn(['new_visit', 'follow_up'])
  @IsNotEmpty()
  visitType: 'new_visit' | 'follow_up';

  @ApiPropertyOptional({
    example: 'Demam tinggi selama 3 hari disertai batuk pilek',
    description: 'Keluhan utama pasien',
  })
  @IsString()
  @IsOptional()
  complaint?: string;

  @ApiPropertyOptional({
    description:
      'ID submission intake medis terkait (misal maternal intake persalinan)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsOptional()
  sourceIntakeId?: string;

  @ApiPropertyOptional({
    description:
      'Konfirmasi persetujuan pasien/admin jika antrean diproyeksikan melewati jam operasional klinik',
    example: true,
  })
  @IsOptional()
  consentOverCapacity?: boolean;
}
