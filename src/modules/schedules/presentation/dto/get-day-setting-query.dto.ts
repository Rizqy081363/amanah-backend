import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class GetDaySettingQueryDto {
  @ApiProperty({
    description: 'Tanggal spesifik pengaturan jadwal (YYYY-MM-DD)',
    example: '2026-08-26',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal harus YYYY-MM-DD',
  })
  date: string;
}
