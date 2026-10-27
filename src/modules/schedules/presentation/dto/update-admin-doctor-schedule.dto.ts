import { AdminScheduleStatusRequest } from '@modules/schedules/domain/schedule-status';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateAdminDoctorScheduleDto {
  @ApiPropertyOptional({
    description: 'Status cuti dokter (true jika sedang cuti)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isOnLeave?: boolean;

  @ApiPropertyOptional({
    description: 'Alasan dokter cuti',
    example: 'Cuti Tahunan',
  })
  @IsOptional()
  @IsString()
  leaveReason?: string;

  @ApiPropertyOptional({
    description: 'Tanggal mulai cuti (format YYYY-MM-DD)',
    example: '2026-09-25',
  })
  @IsOptional()
  @IsString()
  leaveStart?: string;

  @ApiPropertyOptional({
    description: 'Tanggal selesai cuti (format YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsString()
  leaveEnd?: string;

  @ApiPropertyOptional({
    description:
      'Canonical schedule operating status. Doctor leave is controlled by isOnLeave, not this field.',
    enum: AdminScheduleStatusRequest,
    example: AdminScheduleStatusRequest.CLOSED,
  })
  @IsOptional()
  @IsEnum(AdminScheduleStatusRequest)
  scheduleStatus?: AdminScheduleStatusRequest;

  @ApiPropertyOptional({
    description: 'Ruang tempat praktik dokter',
    example: 'Poli Penyakit Dalam, Room 201',
  })
  @IsOptional()
  @IsString()
  practiceRoom?: string;

  @ApiPropertyOptional({
    description: 'ID Ruangan praktik (UUID)',
    example: 'e3067341-a185-484d-91d6-84848fcff1ef',
  })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'Tanggal target perubahan (format YYYY-MM-DD)',
    example: '2026-09-22',
  })
  @IsOptional()
  @IsString()
  date?: string;
}
