import { AdminScheduleStatusRequest } from '@modules/schedules/domain/schedule-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
