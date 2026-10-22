import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CheckExportAvailabilityDto {
  @ApiProperty({
    enum: ['attendance', 'payroll'],
    description: 'Tipe domain data yang akan diekspor',
    example: 'attendance',
  })
  @IsString()
  @IsIn(['attendance', 'payroll'])
  exportType: string;

  @ApiPropertyOptional({
    type: Object,
    description: 'Parameter penyaringan data (misal: startDate, endDate, periodId)',
    example: { startDate: '2026-10-01', endDate: '2026-10-31' },
  })
  @IsObject()
  @IsOptional()
  parameters?: Record<string, any>;
}
