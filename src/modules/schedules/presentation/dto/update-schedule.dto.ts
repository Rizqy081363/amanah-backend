import {
  type CanonicalStaffShift,
} from '@modules/schedules/domain/constants/schedule-shift.constants';
import { AdminScheduleStatusRequest } from '@modules/schedules/domain/schedule-status';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateScheduleDto {
  @ApiPropertyOptional({
    example: 'afternoon',
    description: 'Kode shift atau sesi praktek dokter',
  })
  @IsString()
  @IsOptional()
  session?: CanonicalStaffShift;

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
    description: 'Canonical schedule operating status',
  })
  @IsEnum(AdminScheduleStatusRequest)
  @IsOptional()
  status?: AdminScheduleStatusRequest;

  @ApiPropertyOptional({ example: 'Jadwal dimajukan 30 menit' })
  @IsString()
  @IsOptional()
  notes?: string;
}
