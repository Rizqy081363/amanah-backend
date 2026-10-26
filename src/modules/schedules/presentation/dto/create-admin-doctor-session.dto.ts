import { AdminScheduleStatusRequest } from '@modules/schedules/domain/schedule-status';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateAdminDoctorSessionDto {
  @ApiProperty({
    description: 'Tanggal sesi praktik (format YYYY-MM-DD)',
    example: '2026-09-22',
  })
  @IsNotEmpty()
  @IsString()
  scheduleDate: string;

  @ApiProperty({
    description:
      'Nama sesi praktik (Sesi Pagi, Sesi Siang / Sore, Sesi Malam, Shift Dini Hari, atau custom)',
    example: 'Sesi Malam',
  })
  @IsNotEmpty()
  @IsString()
  sessionName: string;

  @ApiProperty({
    description: 'Jam mulai sesi (format HH:mm)',
    example: '19:00',
  })
  @IsNotEmpty()
  @IsString()
  startTime: string;

  @ApiProperty({
    description: 'Jam selesai sesi (format HH:mm)',
    example: '22:00',
  })
  @IsNotEmpty()
  @IsString()
  endTime: string;

  @ApiPropertyOptional({
    description: 'Canonical session operating status',
    enum: AdminScheduleStatusRequest,
    default: AdminScheduleStatusRequest.OPEN,
    example: AdminScheduleStatusRequest.OPEN,
  })
  @IsOptional()
  @IsEnum(AdminScheduleStatusRequest)
  sessionStatus?: AdminScheduleStatusRequest = AdminScheduleStatusRequest.OPEN;

  @ApiPropertyOptional({
    description: 'Nama ruangan atau ID ruangan praktik',
    example: 'Poli Penyakit Dalam, Room 201',
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
