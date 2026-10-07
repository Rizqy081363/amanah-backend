import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PerformCheckInDto {
  @ApiPropertyOptional({
    description: 'Token UUID QR Code check-in yang dipindai kamera',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({
    description: 'Kode 6 karakter alfanumerik verifikasi manual',
    example: 'CK8F42',
  })
  @IsOptional()
  @IsString()
  manualCode?: string;

  @ApiPropertyOptional({
    description: 'ID unik janji temu (opsional bila sudah ada token/code)',
    example: '6d3a26e2-77fb-466d-9096-d3b2400c443d',
  })
  @IsOptional()
  @IsString()
  appointmentId?: string;
}
