import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CalendarSummaryQueryDto {
  @ApiProperty({
    description: 'Bulan kalender yang ingin ditampilkan (YYYY-MM)',
    example: '2026-08',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'Format bulan harus YYYY-MM',
  })
  month: string;
}
