import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ScanQrDto {
  @ApiProperty({
    example: 'AMANAH-PRESENSI-2026-09-17-PAGI',
    description:
      'Kode token QR atau 6-digit OTP yang ditampilkan pada layar terminal presensi',
  })
  @IsString()
  @IsNotEmpty()
  qrToken: string;

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
