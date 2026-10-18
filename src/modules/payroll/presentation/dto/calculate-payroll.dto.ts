import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CalculatePayrollDto {
  @ApiProperty({
    example: 'Oktober 2026',
    description: 'Nama label periode penggajian',
  })
  @IsString()
  @IsNotEmpty()
  periodName: string;

  @ApiProperty({
    example: '2026-10-01',
    description: 'Tanggal awal periode (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsNotEmpty()
  periodStart: string;

  @ApiProperty({
    example: '2026-10-31',
    description: 'Tanggal akhir periode (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsNotEmpty()
  periodEnd: string;
}
