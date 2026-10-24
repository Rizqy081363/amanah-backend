import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  ATTENDANCE_METHODS,
  AttendanceMethod,
} from '../../domain/constants/attendance.constants';

export class CheckOutDto {
  @ApiPropertyOptional({
    description: 'ID profil staf (UUID) atau kode staf resmi (Staff Code)',
    example: 'STF-DOK-5763',
  })
  @IsString()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional({
    description: 'Alias untuk staffId: ID profil staf atau Staff Code resmi',
    example: 'STF-DOK-5763',
  })
  @IsString()
  @IsOptional()
  staffIdOrCode?: string;

  @ApiPropertyOptional({
    description: 'Tanggal presensi (YYYY-MM-DD)',
    example: '2026-10-24',
  })
  @IsString()
  @IsOptional()
  attendanceDate?: string;

  @ApiPropertyOptional({
    description: 'Token QR dinamis dari terminal klinik (6-digit token atau kode)',
    example: 'D3F9A1',
  })
  @IsString()
  @IsOptional()
  qrToken?: string;

  @ApiPropertyOptional({
    description: 'Metode presensi pulang staf sesuai enum attendance_method di database',
    enum: ATTENDANCE_METHODS,
    example: 'qr_scan',
  })
  @IsIn(ATTENDANCE_METHODS)
  @IsOptional()
  method?: AttendanceMethod;

  @ApiPropertyOptional({
    description: 'Catatan alasan kepulangan darurat / pulang awal jika sebelum jadwal usai',
    example: 'Izin dinas luar / visit rujukan',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Tiket verifikasi presensi pulang awal berbatas waktu 3 menit dari scan terminal fisik',
    example: 'eyJnZW4iOjF9.signature...',
  })
  @IsString()
  @IsOptional()
  checkoutTicket?: string;
}
