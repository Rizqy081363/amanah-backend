import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AdminScheduleStatusRequest } from '../../domain/schedule-status';

export class UpdateAdminDayStatusDto {
  @ApiProperty({
    description: 'Canonical day operating status',
    enum: AdminScheduleStatusRequest,
    example: AdminScheduleStatusRequest.CLOSED,
  })
  @IsNotEmpty()
  @IsEnum(AdminScheduleStatusRequest)
  status: AdminScheduleStatusRequest;

  @ApiPropertyOptional({
    description: 'Catatan operasional atau alasan cuti',
    example: 'Izin Dinas Luar Kota',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
