import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class ProposeRescheduleDto {
  @ApiProperty({
    description: 'Tanggal baru yang diusulkan oleh klinik (YYYY-MM-DD)',
    example: '2026-11-04',
  })
  @IsNotEmpty({ message: 'Tanggal target yang diusulkan wajib diisi' })
  @IsDateString(
    {},
    { message: 'Format tanggal target harus berupa YYYY-MM-DD yang valid' },
  )
  targetDate!: string;

  @ApiProperty({
    description: 'ID sesi dinas yang diusulkan (UUID master session_def)',
    example: 'ab131256-8842-4fcf-8b49-b5d3ac58d7dd',
  })
  @IsNotEmpty({ message: 'Sesi dinas yang diusulkan wajib dipilih' })
  @IsUUID('4', { message: 'ID sesi dinas harus berupa UUID v4 yang valid' })
  targetSessionId!: string;

  @ApiPropertyOptional({
    description: 'ID dokter praktisi yang diusulkan (opsional)',
    example: 'f8a3fa5a-8ace-45b9-9965-fa24f09aed04',
  })
  @IsOptional()
  @IsUUID('4', { message: 'ID dokter harus berupa UUID v4 yang valid' })
  targetDoctorId?: string;

  @ApiPropertyOptional({
    description: 'ID ruangan yang diusulkan (opsional)',
    example: '0d32bb39-b9d6-44c1-8406-fc5a0b73c4f7',
  })
  @IsOptional()
  @IsUUID('4', { message: 'ID ruangan harus berupa UUID v4 yang valid' })
  targetRoomId?: string;

  @ApiProperty({
    description: 'Alasan klinik mengajukan perubahan jadwal janji temu pasien',
    example: 'Dokter berhalangan karena menghadiri seminar kedokteran',
  })
  @IsNotEmpty({ message: 'Alasan pengajuan perubahan jadwal wajib diisi' })
  @IsString({ message: 'Alasan pengajuan harus berupa teks' })
  reason!: string;
}
