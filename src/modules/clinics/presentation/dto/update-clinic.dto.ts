import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateClinicDto {
  @ApiPropertyOptional({ example: 'Poli Gigi & Mulut' })
  @IsString()
  @IsOptional()
  namaPoli?: string;

  @ApiPropertyOptional({ example: 'Lantai 2 Gedung Utama' })
  @IsString()
  @IsOptional()
  deskripsi?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
