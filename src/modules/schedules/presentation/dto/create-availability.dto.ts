import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateAvailabilityDto {
  @ApiProperty({
    description: 'Tanggal availability praktik (YYYY-MM-DD)',
    example: '2026-09-23',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal harus YYYY-MM-DD',
  })
  date: string;

  @ApiProperty({
    description: 'Konteks jadwal backend-owned',
    example: 'morning',
  })
  @IsString()
  scheduleContextId: string;

  @ApiProperty({
    description:
      'Jam mulai availability (HH:mm). Backend menghitung endTime (default 1 sesi = 30 menit).',
    example: '08:45',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Format jam mulai harus HH:mm (24 jam)',
  })
  startTime: string;

  @ApiPropertyOptional({
    description:
      'Jam selesai sesi (HH:mm). Jika tidak diisi, backend otomatis menghitung startTime + durasi dokter (default 1 sesi = 30 menit).',
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
      'Jumlah slot konsultasi yang ingin dibuka (default: 1 slot sesi).',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  slotsCount?: number;

  @ApiPropertyOptional({
    description:
      'Jika true, backend memproyeksikan sesi mengisi penuh sisa batas shift.',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  fillShift?: boolean;

  @ApiPropertyOptional({
    description: 'ID Staf/Dokter. Hanya admin boleh mengisi staf lain.',
    example: '9ced2b62-cdcc-4755-9a88-6e69e533c1fe',
  })
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional({
    description: 'ID Unit Poliklinik tempat praktik',
    example: '9ced2b62-cdcc-4755-9a88-6e69e533c1fe',
  })
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({
    description: 'ID ruangan tempat praktik',
    example: '8df8128a-67c5-439c-b27c-192c1d45fe29',
  })
  @IsString()
  @IsOptional()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'ID layanan medis',
    example: '0f7ddf03-0a4e-4ccb-88b5-ec94057ad522',
  })
  @IsString()
  @IsOptional()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'Catatan operasional availability',
    example: 'Mulai praktik setelah visite pagi',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
