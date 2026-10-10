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
  nama_sesi?: string;

  @ApiPropertyOptional({
    description: 'Jam mulai (format HH:mm)',
    example: '08:30',
  })
  @IsOptional()
  @IsString()
  jam_mulai?: string;

  @ApiPropertyOptional({
    description: 'Jam selesai (format HH:mm)',
    example: '12:30',
  })
  @IsOptional()
  @IsString()
  jam_selesai?: string;

  @ApiPropertyOptional({
    description: 'Canonical session operating status',
    enum: AdminScheduleStatusRequest,
    example: AdminScheduleStatusRequest.OPEN,
  })
  @IsOptional()
  @IsEnum(AdminScheduleStatusRequest)
  status_sesi?: AdminScheduleStatusRequest;

  @ApiPropertyOptional({
    description: 'ID Ruangan klinik (UUID) atau nama ruangan',
    example: 'Ruang Poli Umum 1',
  })
  @IsOptional()
  @IsString()
  ruang?: string;
}
