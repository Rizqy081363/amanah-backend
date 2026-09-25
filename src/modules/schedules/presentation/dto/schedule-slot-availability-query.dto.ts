import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ScheduleSlotAvailabilityQueryDto {
  @ApiProperty({
    description: 'Tanggal jadwal target (YYYY-MM-DD)',
    example: '2026-09-25',
  })
  @IsDateString(
    {},
    { message: 'date harus berupa format tanggal valid (YYYY-MM-DD)' },
  )
  date: string;

  @ApiProperty({
    description:
      'Kode shift operasional: early_morning, morning, afternoon, night (atau alias: dini_hari, pagi, siang, malam)',
    example: 'night',
  })
  @IsNotEmpty({ message: 'shift tidak boleh kosong' })
  @IsString()
  shift: string;

  @ApiProperty({
    description: 'UUID ruangan klinik yang diperiksa ketersediaannya',
    example: 'b77d141b-2fa5-4481-9f47-a5a040faf57a',
  })
  @IsUUID('4', { message: 'roomId harus berupa UUID v4 yang valid' })
  roomId: string;

  @ApiPropertyOptional({
    description:
      'UUID jadwal saat ini yang dikecualikan dari kalkulasi bentrok (opsional, saat edit)',
    example: '6fb1f17e-e9cf-44bd-add6-773c5fb870e9',
  })
  @IsOptional()
  @IsUUID('4', { message: 'excludeScheduleId harus berupa UUID v4 yang valid' })
  excludeScheduleId?: string;

  @ApiPropertyOptional({
    description:
      'ID praktisi atau staf dokter (opsional, jika diakses oleh Administrator klinik)',
    example: '3cb62e10-450b-43e5-aba9-49ec37079ebb',
  })
  @IsOptional()
  @IsUUID('4', { message: 'staffId harus berupa UUID v4 yang valid' })
  staffId?: string;
}
