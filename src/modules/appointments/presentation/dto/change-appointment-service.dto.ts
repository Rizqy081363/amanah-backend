import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ChangeAppointmentServiceDto {
  @ApiProperty({
    description: 'ID layanan medis target yang akan dialihkan (UUID)',
    example: 'b77d141b-2fa5-4481-9f47-a5a040faf57a',
  })
  @IsUUID('4', { message: 'ID layanan harus berformat UUID v4 valid' })
  @IsNotEmpty({ message: 'Target serviceId wajib diisi' })
  serviceId: string;

  @ApiPropertyOptional({
    description: 'Keluhan pasien yang diperbarui (opsional)',
  })
  @IsString()
  @IsOptional()
  complaint?: string;
}
