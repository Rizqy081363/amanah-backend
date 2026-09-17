import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateScheduleDto {
  @ApiPropertyOptional({
    description:
      'ID Staf Dokter/Bidan. Jika kosong, akan menggunakan ID staf yang sedang login',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional({
    description: 'ID Unit Poliklinik tempat praktek',
  })
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiProperty({
    description: 'Tanggal spesifik jadwal (YYYY-MM-DD)',
    example: '2026-09-18',
  })
  @IsString()
  @IsNotEmpty()
  specificDate: string;

  @ApiProperty({
    enum: ['PAGI', 'SIANG', 'MALAM'],
    example: 'PAGI',
    description: 'Sesi giliran praktek dokter',
  })
  @IsEnum(['PAGI', 'SIANG', 'MALAM'])
  @IsNotEmpty()
  session: 'PAGI' | 'SIANG' | 'MALAM';

  @ApiPropertyOptional({ example: '08:00', description: 'Jam mulai' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ example: '12:00', description: 'Jam selesai' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Kapasitas maksimal kuota antrean pasien',
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity?: number = 20;

  @ApiPropertyOptional({
    example: 'Praktek spesialis anak reguler',
    description: 'Catatan tambahan jadwal',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean = true;
}
