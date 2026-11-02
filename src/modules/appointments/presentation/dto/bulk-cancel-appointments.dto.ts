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

export class BulkCancelAppointmentsDto {
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
    description: 'Alasan pembatalan janji temu massal',
    example: 'Klinik tutup mendadak / dokter berhalangan hadir',
  })
  @IsNotEmpty({ message: 'Alasan pembatalan wajib diisi' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({
    description: 'Menandai apakah pembatalan disebabkan karena pasien terlambat (No-Show)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isNoShow?: boolean;
}
