import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class RoomReferenceQueryDto {
  @ApiPropertyOptional({
    description: 'Tanggal pengecekan ketersediaan ruangan (YYYY-MM-DD)',
    example: '2026-08-26',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal harus YYYY-MM-DD',
  })
  date?: string;

  @ApiPropertyOptional({
    description: 'Jam mulai pengecekan okupansi ruangan (HH:mm)',
    example: '07:00',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Format jam mulai harus HH:mm (24 jam)',
  })
  startTime?: string;

  @ApiPropertyOptional({
    description: 'Jam selesai pengecekan okupansi ruangan (HH:mm)',
    example: '11:00',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Format jam selesai harus HH:mm (24 jam)',
  })
  endTime?: string;

  @ApiPropertyOptional({
    description:
      'ID Praktisi atau Staff Profile yang dikecualikan dari deteksi okupansi (menghindari deteksi self-collision)',
    example: 'cfc88fab-46f8-4e71-bf72-00858ea0c885',
  })
  @IsString()
  @IsOptional()
  excludePractitionerId?: string;
}
