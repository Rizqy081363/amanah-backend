import {
  CANONICAL_SESSION_NAMES,
  type CanonicalSessionName,
  SESSION_TO_SHIFT_MAP,
  SHIFT_TO_SESSION_MAP,
} from '@modules/schedules/domain/constants/schedule-shift.constants';
import { AdminScheduleStatusRequest } from '@modules/schedules/domain/schedule-status';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateScheduleDto {
  @ApiPropertyOptional({
    enum: CANONICAL_SESSION_NAMES,
    example: 'SIANG',
    description:
      'Sesi giliran praktek dokter (DINI_HARI / PAGI / SIANG / MALAM)',
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const shift =
        SESSION_TO_SHIFT_MAP[trimmed] ||
        SESSION_TO_SHIFT_MAP[trimmed.toUpperCase()];
      if (shift) {
        return SHIFT_TO_SESSION_MAP[shift];
      }
    }
    return value;
  })
  @IsString()
  @IsOptional()
  session?: CanonicalSessionName;

  @ApiPropertyOptional({
    example: 'Siang',
    description: 'Label sesi praktek (Pagi, Siang, Malam)',
  })
  @IsString()
  @IsOptional()
  sessionType?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({
    description: 'ID Ruangan tempat praktek',
    example: 'room-uuid-201',
  })
  @IsString()
  @IsOptional()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'ID Poliklinik',
    example: 'cd44dd7d-07a9-4e31-9441-3e0e02ddebb1',
  })
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({
    description: 'ID Layanan Medis',
    example: 'service-uuid-001',
  })
  @IsString()
  @IsOptional()
  serviceId?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    enum: AdminScheduleStatusRequest,
    example: AdminScheduleStatusRequest.OPEN,
    description:
      'Canonical schedule operating status (OPEN / CLOSED / Buka / Tutup)',
  })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toUpperCase();
      if (normalized === 'TUTUP' || normalized === 'CLOSED') {
        return AdminScheduleStatusRequest.CLOSED;
      }
      if (normalized === 'BUKA' || normalized === 'OPEN') {
        return AdminScheduleStatusRequest.OPEN;
      }
    }
    return value;
  })
  @IsEnum(AdminScheduleStatusRequest)
  @IsOptional()
  status?: AdminScheduleStatusRequest;

  @ApiPropertyOptional({ example: 'Jadwal dimajukan 30 menit' })
  @IsString()
  @IsOptional()
  notes?: string;
}
