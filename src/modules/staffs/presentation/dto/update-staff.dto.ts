import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateStaffDto {
  @ApiPropertyOptional({ example: 'Dr. Hendra Wijaya, Sp.A, M.Kes' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: 'Dokter Spesialis Anak Senior' })
  @IsString()
  @IsOptional()
  profession?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({ example: '081299887711' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
