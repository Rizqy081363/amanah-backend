import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class QueryQueueNavigationDto {
  @ApiPropertyOptional({
    description: 'Tanggal pelayanan (YYYY-MM-DD)',
    example: '2026-10-25',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Format tanggal harus YYYY-MM-DD',
  })
  date?: string;

  @ApiPropertyOptional({
    description: 'Kode sesi operasional (morning, afternoon, etc.)',
    example: 'morning',
  })
  @IsOptional()
  @IsString()
  session?: string;
}
