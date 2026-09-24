import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class ScheduleContextQueryDto {
  @ApiProperty({
    description: 'Tanggal jadwal yang akan dievaluasi (YYYY-MM-DD)',
    example: '2026-09-23',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal harus YYYY-MM-DD',
  })
  date: string;

  @ApiPropertyOptional({
    description:
      'ID Staf / Praktisi. Hanya admin boleh menentukan praktisi lain.',
    example: '9ced2b62-cdcc-4755-9a88-6e69e533c1fe',
  })
  @IsString()
  @IsOptional()
  staffId?: string;
}
