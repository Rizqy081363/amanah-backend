import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class BulkRevertProposalDto {
  @ApiProperty({
    description:
      'Daftar ID janji temu pasien yang akan dibatalkan persetujuan usulannya',
    example: ['0d32bb39-b9d6-44c1-8406-fc5a0b73c4f7'],
    type: [String],
  })
  @IsArray({ message: 'Daftar appointmentIds harus berupa array' })
  @ArrayNotEmpty({ message: 'Minimal harus ada 1 janji temu yang dipilih' })
  @IsUUID('4', {
    each: true,
    message: 'Setiap appointment ID harus berupa UUID v4 yang valid',
  })
  appointmentIds!: string[];

  @ApiPropertyOptional({
    description: 'Alasan pembatalan persetujuan usulan',
    example: 'Operasional klinik telah normal kembali',
  })
  @IsOptional()
  @IsString({ message: 'Alasan harus berupa teks' })
  reason?: string;
}
