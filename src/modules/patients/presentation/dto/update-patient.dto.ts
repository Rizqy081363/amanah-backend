import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdatePatientDto {
  @ApiPropertyOptional({ example: 'Dewi Lestari M.Si' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: '081298765432' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'Jl. Dago Asri No. 10, Bandung' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'PNS' })
  @IsString()
  @IsOptional()
  pekerjaan?: string;

  @ApiPropertyOptional({ example: 'Asma terkontrol' })
  @IsString()
  @IsOptional()
  medicalHistory?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsEnum(['active', 'inactive'])
  @IsOptional()
  status?: 'active' | 'inactive';
}
