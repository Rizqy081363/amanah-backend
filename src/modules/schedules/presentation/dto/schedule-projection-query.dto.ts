import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class ScheduleProjectionQueryDto {
  @ApiProperty({
    description: 'Tanggal jadwal yang akan diproyeksikan (YYYY-MM-DD)',
    example: '2026-09-23',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal harus YYYY-MM-DD',
  })
  date: string;

  @ApiProperty({
    description: 'ID konteks jadwal backend-owned atau kode shift',
    example: 'morning',
  })
  @IsString()
  scheduleContextId: string;

  @ApiProperty({
    description: 'Jam mulai yang dipilih dokter (HH:mm), tidak dibulatkan',
    example: '08:45',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Format jam mulai harus HH:mm (24 jam)',
  })
  startTime: string;

  @ApiPropertyOptional({
    description:
      'Jam selesai sesi yang ingin diproyeksikan (HH:mm). Default: 1 sesi (30 menit).',
    example: '09:15',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Format jam selesai harus HH:mm (24 jam)',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description:
      'Jika true, backend memproyeksikan seluruh interval hingga batas akhir shift.',
    example: false,
  })
  @Transform(
    ({ value }) =>
      value === 'true' || value === true || value === 1 || value === '1',
  )
  @IsBoolean()
  @IsOptional()
  fillShift?: boolean;

  @ApiPropertyOptional({
    description: 'ID ruangan untuk simulasi okupansi ruangan',
    example: '0f7ddf03-0a4e-4ccb-88b5-ec94057ad522',
  })
  @IsString()
  @IsOptional()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'ID layanan medis yang akan dikaitkan ke availability',
    example: '8df8128a-67c5-439c-b27c-192c1d45fe29',
  })
  @IsString()
  @IsOptional()
  serviceId?: string;

  @ApiPropertyOptional({
    description:
      'ID Staf / Praktisi. Hanya admin boleh menentukan praktisi lain.',
    example: '9ced2b62-cdcc-4755-9a88-6e69e533c1fe',
  })
  @IsString()
  @IsOptional()
  staffId?: string;
}
