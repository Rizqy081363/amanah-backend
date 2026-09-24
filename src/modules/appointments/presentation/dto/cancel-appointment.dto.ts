import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CancelAppointmentDto {
  @ApiProperty({
    description: 'Alasan pembatalan janji temu',
    example: 'Pasien terlambat melebihi 30 menit atau berhalangan hadir',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiPropertyOptional({
    description:
      'Menandai apakah pembatalan disebabkan karena pasien terlambat (No-Show)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isNoShow?: boolean;
}
