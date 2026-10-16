import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class InviteDoctorDto {
  @ApiProperty({
    example: 'dr.hendra@example.com',
    description: 'Email dokter atau bidan yang akan diundang',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email praktisi wajib diisi' })
  email: string;

  @ApiProperty({
    example: 'd9b04fc2-5f36-4c4b-873b-e0c1f2b6e123',
    description: 'ID Poliklinik (unit_type=polyclinic dari clinic_units)',
  })
  @IsUUID('4', { message: 'ID Poliklinik harus UUID v4 valid' })
  @IsNotEmpty({ message: 'Poliklinik penugasan wajib dipilih' })
  poliklinikId: string;

  @ApiPropertyOptional({
    example: 'dr. Hendra Wijaya, Sp.A',
    description: 'Nama lengkap praktisi (opsional, dapat diisi saat onboarding)',
  })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({
    example: 'staff_doctor',
    description: 'Kode peran klinis (diambil dari endpoint options: staff_doctor atau staff_midwife)',
    enum: ['staff_doctor', 'staff_midwife'],
    default: 'staff_doctor',
  })
  @IsIn(['staff_doctor', 'staff_midwife'], {
    message: 'Peran klinis harus staff_doctor atau staff_midwife',
  })
  @IsOptional()
  roleCode?: 'staff_doctor' | 'staff_midwife' = 'staff_doctor';
}

