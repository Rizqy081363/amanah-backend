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

  @ApiPropertyOptional({
    example: 'annual_leave',
    description:
      'Jenis permohonan cuti: annual_leave, sick_leave, seminar_symposium, family_matter, external_assignment, other',
    enum: [
      'annual_leave',
      'sick_leave',
      'seminar_symposium',
      'family_matter',
      'external_assignment',
      'other',
    ],
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID staf pengganti yang melimpahkan tugas selama cuti',
  })
  @IsString()
  @IsOptional()
  substituteStaffId?: string;
}
