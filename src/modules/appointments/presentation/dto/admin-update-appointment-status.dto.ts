import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminUpdateAppointmentStatusDto {
  @ApiProperty({
    description: 'Status baru antrean janji temu',
    enum: [
      'waiting',
      'in_service',
      'completed',
      'no_show',
      'cancelled',
      'booked',
    ],
    example: 'in_service',
  })
  @IsNotEmpty()
  @IsString()
  status: string;

  @ApiPropertyOptional({
    description: 'Catatan atau alasan perubahan status',
    example: 'Pasien dipanggil masuk ke Ruang Poli Umum 1',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
