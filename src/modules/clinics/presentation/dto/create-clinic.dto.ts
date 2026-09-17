import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClinicDto {
  @ApiProperty({ example: 'Poli Gigi', description: 'Nama Poliklinik' })
  @IsString()
  @IsNotEmpty()
  namaPoli: string;

  @ApiProperty({ example: 'POLI-GIGI', description: 'Kode unik Poliklinik' })
  @IsString()
  @IsNotEmpty()
  kodePoli: string;

  @ApiPropertyOptional({
    example: 'Lantai 2 Gedung A',
    description: 'Deskripsi / Lokasi Poliklinik',
  })
  @IsString()
  @IsOptional()
  deskripsi?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}
