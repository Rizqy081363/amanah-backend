import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class BulkAssignDoctorDto {
  @ApiProperty({
    description: 'Daftar ID unik janji temu pasien (UUID)',
    example: ['6d3a26e2-77fb-466d-9096-d3b2400c443d'],
    type: [String],
  })
  @IsArray({ message: 'appointmentIds harus berupa array UUID' })
  @ArrayNotEmpty({ message: 'appointmentIds tidak boleh kosong' })
  @IsUUID('4', { each: true, message: 'Setiap appointmentId harus berformat UUID v4 valid' })
  appointmentIds: string[];

  @ApiProperty({
    description: 'ID dokter tujuan yang akan ditugaskan (UUID)',
    example: '77bbb45a-18df-4311-b2a4-a4b6f22870ca',
  })
  @IsUUID('4', { message: 'doctorId harus berformat UUID v4 valid' })
  @IsNotEmpty({ message: 'doctorId wajib diisi' })
  doctorId: string;

  @ApiPropertyOptional({
    description: 'Alasan penugasan dokter massal',
    example: 'Penugasan massal sesi pagi',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Tutup sesi/jadwal dokter sebelumnya setelah pemindahan pasien',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  closeOldSchedule?: boolean;
}
