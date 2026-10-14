import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class InviteDoctorDto {
  @ApiProperty({
    example: 'dr.hendra@example.com',
    description: 'Email dokter yang akan diundang',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsEmail({}, { message: 'Format email dokter tidak valid' })
  @IsNotEmpty({ message: 'Email dokter wajib diisi' })
  email: string;

  @ApiProperty({
    example: 'd9b04fc2-5f36-4c4b-873b-e0c1f2b6e123',
    description: 'ID Poliklinik (unit_type=polyclinic dari clinic_units)',
  })
  @IsUUID('4', { message: 'ID Poliklinik harus UUID v4 valid' })
  @IsNotEmpty({ message: 'Poliklinik penugasan dokter wajib dipilih' })
  poliklinikId: string;

  @ApiPropertyOptional({
    example: 'dr. Hendra Wijaya, Sp.A',
    description: 'Nama lengkap dokter (opsional, dapat diisi saat onboarding)',
  })
  @IsString()
  @IsOptional()
  fullName?: string;
}

