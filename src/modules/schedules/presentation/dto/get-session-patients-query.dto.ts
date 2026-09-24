import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class GetSessionPatientsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter status antrean pasien',
    enum: ['waiting', 'in_service', 'completed', 'cancelled', 'no_show', 'all'],
    default: 'all',
    example: 'waiting',
  })
  @IsOptional()
  @IsEnum(['waiting', 'in_service', 'completed', 'cancelled', 'no_show', 'all'])
  status?: string = 'all';

  @ApiPropertyOptional({
    description: 'Pencarian nama pasien atau nomor rekam medis',
    example: 'Ahmad',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
