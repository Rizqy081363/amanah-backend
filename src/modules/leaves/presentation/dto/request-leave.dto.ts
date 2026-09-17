import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class RequestLeaveDto {
  @ApiProperty({
    example: '2026-09-20',
    description: 'Tanggal awal cuti/izin (Format YYYY-MM-DD)',
  })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    example: '2026-09-22',
    description: 'Tanggal akhir cuti/izin (Format YYYY-MM-DD)',
  })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @ApiProperty({
    example: 'Keperluan keluarga mendesak dan acara pernikahan keluarga',
    description: 'Alasan atau keterangan permohonan cuti',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({
    example: 'https://storage.amanah-clinic.id/documents/surat_izin_2026.pdf',
    description: 'URL dokumen pendukung atau surat keterangan dokter/acara',
  })
  @IsString()
  @IsOptional()
  documentUrl?: string;
}
