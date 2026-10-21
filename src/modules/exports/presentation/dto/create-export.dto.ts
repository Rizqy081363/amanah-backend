import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateExportDto {
  @ApiProperty({
    description: 'Tipe domain laporan yang akan diekspor',
    example: 'attendance',
    enum: ['attendance', 'payroll', 'appointment', 'schedule'],
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['attendance', 'payroll', 'appointment', 'schedule'])
  exportType: string;

  @ApiProperty({
    description: 'Format dokumen berkas keluaran',
    example: 'xlsx',
    enum: ['csv', 'xlsx', 'pdf'],
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(['csv', 'xlsx', 'pdf'])
  format: 'csv' | 'xlsx' | 'pdf';

  @ApiProperty({
    description: 'Parameter kueri filter spesifik modul (misal: periodId, startDate, endDate)',
    example: { periodId: '312aa774-3e16-4573-8b53-85e8a101de17' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;
}
