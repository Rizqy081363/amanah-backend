import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RosterItemDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID Sesi Operasional (session_def)',
  })
  @IsUUID('4', { message: 'ID Sesi harus UUID v4 valid' })
  @IsNotEmpty({ message: 'ID Sesi wajib diisi' })
  sessionId: string;

  @ApiProperty({
    example: 1,
    description: 'Hari kerja (0 = Minggu, 1 = Senin, ..., 6 = Sabtu)',
    minimum: 0,
    maximum: 6,
  })
  @IsInt({ message: 'Hari (dow) harus berupa angka integer' })
  @Min(0, { message: 'Hari minimum adalah 0 (Minggu)' })
  @Max(6, { message: 'Hari maksimum adalah 6 (Sabtu)' })
  dow: number;

  @ApiPropertyOptional({
    example: 'Shift pagi meja pendaftaran utama',
    description: 'Catatan operasional roster',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class BulkReplaceRosterDto {
  @ApiProperty({
    type: [RosterItemDto],
    description: 'Daftar jadwal shift kerja mingguan yang akan diperbarui',
  })
  @IsArray({ message: 'Roster items harus berupa array' })
  @ValidateNested({ each: true })
  @Type(() => RosterItemDto)
  rosters: RosterItemDto[];
}
