import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class ScheduleCapacityQueryDto {
  @ApiProperty({
    description: 'Tanggal target inspeksi kapasitas dan beban layanan shift (YYYY-MM-DD)',
    example: '2026-09-25',
  })
  @IsNotEmpty({ message: 'Parameter date wajib disertakan' })
  @IsDateString(
    { strict: true },
    { message: 'Format date harus berupa YYYY-MM-DD standar ISO' },
  )
  date: string;

  @ApiPropertyOptional({
    description:
      'ID praktisi medis / staf dokter (opsional untuk dokter, wajib untuk admin non-praktisi)',
    example: '3cb62e10-450b-43e5-aba9-49ec37079ebb',
  })
  @IsOptional()
  @IsUUID('4', { message: 'staffId harus berupa format UUID v4 yang valid' })
  staffId?: string;

  @ApiPropertyOptional({
    description:
      'ID ruangan klinik yang dipilih untuk memeriksa kapasitas ruangan',
    example: 'e3067341-a185-484d-91d6-84848fcff1ef',
  })
  @IsOptional()
  @IsUUID('4', { message: 'roomId harus berupa format UUID v4 yang valid' })
  roomId?: string;
}

