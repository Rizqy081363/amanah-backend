import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class ChangeAppointmentDoctorDto {
  @ApiProperty({
    description: 'ID dokter baru yang akan ditugaskan (UUID)',
    example: '77bbb45a-18df-4311-b2a4-a4b6f22870ca',
  })
  @IsUUID('4', { message: 'ID dokter harus berformat UUID v4 valid' })
  @IsNotEmpty({ message: 'Target doctorId wajib diisi' })
  doctorId: string;

  @ApiPropertyOptional({
    description:
      'Tutup sesi/jadwal dokter sebelumnya setelah pemindahan pasien (Edge Case 5/6)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  closeOldSchedule?: boolean;

  @ApiPropertyOptional({
    description:
      'Alasan pengalihan dokter (misal: dokter berhalangan hadir / kendala teknis)',
    example: 'Dokter berhalangan hadir',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
