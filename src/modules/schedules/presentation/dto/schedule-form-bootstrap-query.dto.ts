import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ScheduleFormBootstrapQueryDto {
  @ApiProperty({
    description: 'Tanggal jadwal target (YYYY-MM-DD)',
    example: '2026-09-25',
  })
  @IsDateString(
    {},
    { message: 'date harus berupa format tanggal valid (YYYY-MM-DD)' },
  )
  date: string;

  @ApiPropertyOptional({
    description: 'ID jadwal yang sedang diedit (opsional, jika dalam mode edit)',
    example: '6fb1f17e-e9cf-44bd-add6-773c5fb870e9',
  })
  @IsOptional()
  @IsUUID('4', { message: 'scheduleId harus berupa UUID v4 yang valid' })
  scheduleId?: string;

  @ApiPropertyOptional({
    description:
      'ID praktisi atau staf dokter (opsional, jika diakses oleh Administrator klinik)',
    example: '3cb62e10-450b-43e5-aba9-49ec37079ebb',
  })
  @IsOptional()
  @IsUUID('4', { message: 'staffId harus berupa UUID v4 yang valid' })
  staffId?: string;
}
