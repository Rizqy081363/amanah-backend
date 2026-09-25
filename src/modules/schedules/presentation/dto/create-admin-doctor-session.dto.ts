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
  schedule_date: string;

  @ApiProperty({
    description:
      'Nama sesi praktik (Sesi Pagi, Sesi Siang / Sore, Sesi Malam, Shift Dini Hari, atau custom)',
    example: 'Sesi Malam',
  })
  @IsNotEmpty()
  @IsString()
  nama_sesi: string;

  @ApiProperty({
    description: 'Jam mulai sesi (format HH:mm)',
    example: '19:00',
  })
  @IsNotEmpty()
  @IsString()
  jam_mulai: string;

  @ApiProperty({
    description: 'Jam selesai sesi (format HH:mm)',
    example: '22:00',
  })
  @IsNotEmpty()
  @IsString()
  jam_selesai: string;

  @ApiProperty({
    description: 'Batas kuota pasien untuk sesi ini',
    example: 10,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  kuota_pasien: number;

  @ApiPropertyOptional({
    description:
      'Jumlah slot pasien yang tersedia (default sama dengan kuota_pasien)',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  slot_tersedia?: number;

  @ApiPropertyOptional({
    description: 'Canonical session operating status',
    enum: AdminScheduleStatusRequest,
    default: AdminScheduleStatusRequest.OPEN,
    example: AdminScheduleStatusRequest.OPEN,
  })
  @IsOptional()
  @IsEnum(AdminScheduleStatusRequest)
  status_sesi?: AdminScheduleStatusRequest = AdminScheduleStatusRequest.OPEN;

  @ApiPropertyOptional({
    description: 'Nama ruangan atau ID ruangan praktik',
    example: 'Poli Penyakit Dalam, Room 201',
  })
  @IsOptional()
  @IsString()
  ruang?: string;
}
