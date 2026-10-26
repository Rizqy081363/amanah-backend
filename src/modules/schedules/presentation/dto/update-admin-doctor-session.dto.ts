import { AdminScheduleStatusRequest } from '@modules/schedules/domain/schedule-status';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateAdminDoctorSessionDto {
  @ApiPropertyOptional({
    description: 'Nama sesi / label',
    example: 'Sesi Pagi Tambahan',
  })
  @IsOptional()
  @IsString()
  sessionName?: string;

  @ApiPropertyOptional({
    description: 'Jam mulai (format HH:mm)',
    example: '08:30',
  })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Jam selesai (format HH:mm)',
    example: '12:30',
  })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({
    description: 'Canonical session operating status',
    enum: AdminScheduleStatusRequest,
    example: AdminScheduleStatusRequest.OPEN,
  })
  @IsOptional()
  @IsEnum(AdminScheduleStatusRequest)
  sessionStatus?: AdminScheduleStatusRequest;

  @ApiPropertyOptional({
    description: 'ID Ruangan klinik (UUID)',
    example: 'e3067341-a185-484d-91d6-84848fcff1ef',
  })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'Nama ruangan praktik',
    example: 'Ruang Poli 1',
  })
  @IsOptional()
  @IsString()
  roomName?: string;
}
