import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AppointmentCallActionDto {
  @ApiPropertyOptional({
    description: 'Catatan tambahan terkait panggilan pasien',
    example: 'Pasien tidak berada di ruang tunggu saat dipanggil',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
