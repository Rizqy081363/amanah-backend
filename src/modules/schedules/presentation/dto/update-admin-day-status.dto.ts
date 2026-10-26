import { AdminScheduleStatusRequest } from '@modules/schedules/domain/schedule-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateAdminDayStatusDto {
  @ApiPropertyOptional({
    description: 'Tanggal dinas yang diubah (YYYY-MM-DD)',
    example: '2026-10-28',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({
    description: 'Canonical day operating status',
    enum: AdminScheduleStatusRequest,
    example: AdminScheduleStatusRequest.CLOSED,
  })
  @IsNotEmpty()
  @IsEnum(AdminScheduleStatusRequest)
  status: AdminScheduleStatusRequest;

  @ApiPropertyOptional({
    description: 'Alasan atau catatan perubahan status operasional',
    example: 'Izin Dinas Luar Kota',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
