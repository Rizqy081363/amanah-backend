import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsUUID, Matches } from 'class-validator';

export class CheckRescheduleEligibilityQueryDto {
  @ApiProperty({
    description: 'Tanggal asal sesi yang divalidasi (format: YYYY-MM-DD)',
    example: '2026-10-14',
  })
  @IsNotEmpty({ message: 'sourceDate wajib diisi' })
  @IsDateString({}, { message: 'sourceDate harus berformat YYYY-MM-DD' })
  sourceDate: string;

  @ApiPropertyOptional({
    description:
      'Tanggal target baru yang ingin divalidasi (opsional, format: YYYY-MM-DD)',
    example: '2026-10-15',
  })
  @IsOptional()
  @IsDateString({}, { message: 'targetDate harus berformat YYYY-MM-DD' })
  targetDate?: string;

  @ApiPropertyOptional({
    description:
      'Jam mulai target baru yang ingin divalidasi (opsional, format: HH:mm)',
    example: '09:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'targetStartTime harus berformat HH:mm (00:00 - 23:59)',
  })
  targetStartTime?: string;

  @ApiPropertyOptional({
    description:
      'Jam selesai target baru yang ingin divalidasi (opsional, format: HH:mm). Jika tidak diisi, backend menghitung otomatis dari durasi sesi.',
    example: '15:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'targetEndTime harus berformat HH:mm (00:00 - 23:59)',
  })
  targetEndTime?: string;

  @ApiPropertyOptional({
    description:
      'ID ruangan target baru yang ingin divalidasi ketersediaannya (opsional)',
    example: 'e3067341-a185-484d-91d6-84848fcff1ef',
  })
  @IsOptional()
  @IsUUID('4', { message: 'targetRoomId harus berformat UUID v4' })
  targetRoomId?: string;
}
