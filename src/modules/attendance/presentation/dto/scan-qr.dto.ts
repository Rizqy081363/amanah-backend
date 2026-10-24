import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  ATTENDANCE_METHODS,
  AttendanceMethod,
} from '../../domain/constants/attendance.constants';

export class ScanQrDto {
  @ApiProperty({
    example: 'VAPV8K',
    description:
      'Kode token QR atau 6-digit kode manual yang ditampilkan pada layar terminal presensi',
  })
  @IsString()
  @IsNotEmpty()
  qrToken: string;

  @ApiPropertyOptional({
    description: 'Metode presensi staf sesuai enum attendance_method di database',
    enum: ATTENDANCE_METHODS,
    example: 'qr_scan',
  })
  @IsIn(ATTENDANCE_METHODS)
  @IsOptional()
  method?: AttendanceMethod;

  @ApiPropertyOptional({
    example: 'morning',
    description:
      'Sesi giliran kerja (early_morning, morning, afternoon, night). Jika dikosongkan, backend menentukan shift aktif saat ini.',
  })
  @IsString()
  @IsOptional()
  shift?: string;

  @ApiPropertyOptional({
    example: 'Samsung Galaxy A54 (Android 14) / Web App',
    description: 'Informasi perangkat pengguna saat melakukan pemindaian',
  })
  @IsString()
  @IsOptional()
  deviceInfo?: string;

  @ApiPropertyOptional({
    description: 'ID sesi definisi jadwal bila diketahui',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;
}
