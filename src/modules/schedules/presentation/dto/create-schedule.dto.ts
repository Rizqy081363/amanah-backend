import {
  CANONICAL_STAFF_SHIFTS,
  type CanonicalStaffShift,
} from '@modules/schedules/domain/constants/schedule-shift.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateScheduleDto {
  @ApiPropertyOptional({
    description:
      'ID Staf Dokter/Bidan. Jika kosong, akan menggunakan ID staf yang sedang login',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional({
    description: 'ID Unit Poliklinik tempat praktek',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({
    description: 'ID Ruangan tempat praktek',
    example: 'room-uuid-201',
  })
  @IsString()
  @IsOptional()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'Nama Ruangan tempat praktek',
    example: 'Ruang 201',
  })
  @IsString()
  @IsOptional()
  roomName?: string;

  @ApiPropertyOptional({
    description: 'ID Layanan Medis',
    example: 'service-uuid-001',
  })
  @IsString()
  @IsOptional()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'Tanggal spesifik jadwal (YYYY-MM-DD)',
    example: '2026-08-26',
  })
  @IsString()
  @IsOptional()
  specificDate?: string;

  @ApiPropertyOptional({
    description: 'Alias untuk specificDate (YYYY-MM-DD)',
    example: '2026-08-26',
  })
  @IsString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    enum: CANONICAL_STAFF_SHIFTS,
    example: 'morning',
    description:
      'Sesi giliran praktek dokter (early_morning / morning / afternoon / night)',
  })
  @IsIn(CANONICAL_STAFF_SHIFTS)
  @IsOptional()
  session?: CanonicalStaffShift;

  @ApiPropertyOptional({
    example: 'Pagi',
    description: 'Label sesi praktek (Pagi, Siang, Malam, Dini Hari)',
  })
  @IsString()
  @IsOptional()
  sessionType?: string;

  @ApiPropertyOptional({ example: '07:00', description: 'Jam mulai' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ example: '11:00', description: 'Jam selesai' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({
    example: 'Praktek spesialis reguler',
    description: 'Catatan tambahan jadwal',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean = true;
}
