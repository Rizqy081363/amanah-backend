import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  CANONICAL_SESSION_NAMES,
  type CanonicalSessionName,
} from '../../../schedules/domain/constants/schedule-shift.constants';

export class CreateAppointmentDto {
  @ApiPropertyOptional({
    description:
      'ID Pasien. Jika tidak diisi, otomatis menggunakan ID pasien dari user yang sedang login',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsOptional()
  patientId?: string;

  @ApiProperty({
    description: 'ID Poliklinik tujuan (Poli Umum / Poli KIA)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsString()
  @IsNotEmpty()
  poliklinikId: string;

  @ApiProperty({
    description: 'ID Layanan/Tindakan yang dipilih',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsString()
  @IsNotEmpty()
  layananId: string;

  @ApiPropertyOptional({
    description: 'ID Staf Dokter tertentu jika memilih dokter spesifik',
  })
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiProperty({
    description: 'Tanggal rencana kunjungan (YYYY-MM-DD)',
    example: '2026-09-18',
  })
  @IsString()
  @IsNotEmpty()
  appointmentDate: string;

  @ApiProperty({
    enum: CANONICAL_SESSION_NAMES,
    example: 'PAGI',
    description: 'Sesi giliran kunjungan (DINI_HARI, PAGI, SIANG, MALAM)',
  })
  @IsIn(CANONICAL_SESSION_NAMES)
  @IsNotEmpty()
  session: CanonicalSessionName;

  @ApiPropertyOptional({
    enum: ['Pemeriksaan Baru', 'Kontrol Ulang'],
    default: 'Pemeriksaan Baru',
    example: 'Pemeriksaan Baru',
  })
  @IsEnum(['Pemeriksaan Baru', 'Kontrol Ulang'])
  @IsOptional()
  visitType?: 'Pemeriksaan Baru' | 'Kontrol Ulang' = 'Pemeriksaan Baru';

  @ApiPropertyOptional({
    example: 'Demam tinggi selama 3 hari disertai batuk pilek',
    description: 'Keluhan utama pasien',
  })
  @IsString()
  @IsOptional()
  complaint?: string;
}
