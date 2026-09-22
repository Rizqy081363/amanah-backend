import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateAdminDoctorScheduleDto {
  @ApiPropertyOptional({
    description: 'Status cuti dokter (true jika sedang cuti)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_cuti?: boolean;

  @ApiPropertyOptional({
    description: 'Alasan dokter cuti',
    example: 'Cuti Tahunan & Pemulihan Operasi',
  })
  @IsOptional()
  @IsString()
  cuti_reason?: string;

  @ApiPropertyOptional({
    description: 'Tanggal mulai cuti (format YYYY-MM-DD)',
    example: '2026-09-25',
  })
  @IsOptional()
  @IsString()
  cuti_start?: string;

  @ApiPropertyOptional({
    description: 'Tanggal selesai cuti (format YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsString()
  cuti_end?: string;

  @ApiPropertyOptional({
    description: 'Status operasional jadwal (Buka, Penuh, Cuti, Tutup)',
    example: 'Cuti',
  })
  @IsOptional()
  @IsString()
  status_jadwal?: string;

  @ApiPropertyOptional({
    description: 'Jumlah slot pasien yang tersedia',
    example: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  slot_tersedia?: number;

  @ApiPropertyOptional({
    description: 'Kapasitas maksimal pasien per hari',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  kapasitas_per_hari?: number;

  @ApiPropertyOptional({
    description: 'Ruang tempat praktik dokter',
    example: 'Poli Penyakit Dalam, Room 201',
  })
  @IsOptional()
  @IsString()
  ruang_praktik?: string;

  @ApiPropertyOptional({
    description: 'Tanggal target perubahan (format YYYY-MM-DD)',
    example: '2026-09-22',
  })
  @IsOptional()
  @IsString()
  date?: string;
}
