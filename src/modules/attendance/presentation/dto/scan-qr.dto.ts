import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum ShiftEnum {
  PAGI = 'PAGI',
  SIANG = 'SIANG',
  MALAM = 'MALAM',
}

export class ScanQrDto {
  @ApiProperty({
    enum: ShiftEnum,
    example: ShiftEnum.PAGI,
    description: 'Sesi giliran jaga kerja staf',
  })
  @IsEnum(ShiftEnum)
  @IsNotEmpty()
  shift: ShiftEnum;

  @ApiProperty({
    example: 'AMANAH-PRESENSI-2026-09-17-PAGI',
    description:
      'Kode token QR terenkripsi yang ditampilkan pada layar terminal presensi',
  })
  @IsString()
  @IsNotEmpty()
  qrToken: string;

  @ApiPropertyOptional({
    example: 'Samsung Galaxy A54 (Android 14) / Web App',
    description: 'Informasi perangkat pengguna saat melakukan pemindaian',
  })
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}
