import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DoctorRosterSessionDto {
  @ApiProperty({ example: 'a275fcae-8b87-4efb-a060-5d3517afb506' })
  @IsUUID()
  sessionId: string;

  @ApiProperty({ example: 'morning' })
  @IsString()
  sessionCode: string;

  @ApiProperty({ example: 'Sesi Pagi' })
  @IsString()
  sessionLabel: string;

  @ApiProperty({ example: '08:00 - 12:00' })
  @IsString()
  timeRange: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({ example: null, nullable: true })
  @IsOptional()
  @IsUUID()
  preferredRoomId: string | null;

  @ApiProperty({ example: null, nullable: true })
  @IsOptional()
  @IsString()
  preferredRoomName: string | null;
}

export class DoctorRosterDayDto {
  @ApiProperty({ example: 1, description: 'Day of week: 0=Minggu, 1=Senin..6=Sabtu' })
  @IsInt()
  @Min(0)
  @Max(6)
  dow: number;

  @ApiProperty({ example: 'monday' })
  @IsString()
  dayCode: string;

  @ApiProperty({ example: 'Senin' })
  @IsString()
  dayName: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  sortOrder: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  isWeekend: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  isOperatingDay: boolean;

  @ApiProperty({ type: [DoctorRosterSessionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DoctorRosterSessionDto)
  sessions: DoctorRosterSessionDto[];
}

export class DoctorRosterOverviewResponse {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  doctorId: string;

  @ApiProperty({ example: 'dr. Ahmad Santoso' })
  doctorName: string;

  @ApiProperty({ example: 'Dokter Umum' })
  specialization: string;

  @ApiProperty({ type: [DoctorRosterDayDto] })
  days: DoctorRosterDayDto[];
}

export class UpdateDoctorRosterAssignmentItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  @Max(6)
  dow: number;

  @ApiProperty({ example: 'a275fcae-8b87-4efb-a060-5d3517afb506' })
  @IsUUID()
  sessionId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({ example: null, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  preferredRoomId?: string | null;
}

export class UpdateDoctorRosterDto {
  @ApiProperty({ type: [UpdateDoctorRosterAssignmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateDoctorRosterAssignmentItemDto)
  assignments: UpdateDoctorRosterAssignmentItemDto[];

  @ApiProperty({ example: 'Penyesuaian jam praktik rutin', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DoctorScheduleHistoryItemEntity {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  doctorId: string;

  @ApiProperty({ example: '2026-10-12', nullable: true })
  scheduleDate: string | null;

  @ApiProperty({ example: 'Sesi Pagi', nullable: true })
  sessionLabel: string | null;

  @ApiProperty({ example: 'Senin', nullable: true })
  dayName: string | null;

  @ApiProperty({ example: 'open_schedule' })
  action: string;

  @ApiProperty({ example: 'CLOSED', nullable: true })
  previousStatus: string | null;

  @ApiProperty({ example: 'OPEN', nullable: true })
  newStatus: string | null;

  @ApiProperty({ example: 'Buka kembali jadwal konsultasi', nullable: true })
  reason: string | null;

  @ApiProperty({ example: 'Admin Super', nullable: true })
  changedByName: string | null;

  @ApiProperty({ example: '2026-10-10T08:00:00.000Z' })
  createdAt: string;
}

export class DoctorScheduleHistoryResponse {
  @ApiProperty({ type: [DoctorScheduleHistoryItemEntity] })
  items: DoctorScheduleHistoryItemEntity[];

  @ApiProperty({ example: 10 })
  total: number;
}
