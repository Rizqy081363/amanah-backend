import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelReplacementDto {
  @ApiPropertyOptional({
    example: 'Jadwal dibatalkan karena staf kembali berdinas',
    description: 'Alasan pembatalan peluang dinas pengganti',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
