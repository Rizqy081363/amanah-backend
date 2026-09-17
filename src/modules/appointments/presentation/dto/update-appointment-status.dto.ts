import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAppointmentStatusDto {
  @ApiProperty({
    enum: [
      'SUDAH_BUAT_JANJI',
      'SUDAH_DATANG',
      'MENUNGGU',
      'SEDANG_DIPERIKSA',
      'SELESAI',
      'BATAL',
    ],
    example: 'SEDANG_DIPERIKSA',
    description: 'Status siklus pelayanan antrean dan kunjungan',
  })
  @IsEnum([
    'SUDAH_BUAT_JANJI',
    'SUDAH_DATANG',
    'MENUNGGU',
    'SEDANG_DIPERIKSA',
    'SELESAI',
    'BATAL',
  ])
  @IsNotEmpty()
  status:
    | 'SUDAH_BUAT_JANJI'
    | 'SUDAH_DATANG'
    | 'MENUNGGU'
    | 'SEDANG_DIPERIKSA'
    | 'SELESAI'
    | 'BATAL';

  @ApiPropertyOptional({
    example: 'Pasien tidak hadir setelah dipanggil 3 kali',
    description: 'Alasan pembatalan jika status BATAL',
  })
  @IsString()
  @IsOptional()
  cancellationReason?: string;
}
