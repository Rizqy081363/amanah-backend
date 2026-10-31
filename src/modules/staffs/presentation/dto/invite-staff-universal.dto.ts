import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class InviteStaffUniversalDto {
  @ApiProperty({
    example: 'pegawai@example.com',
    description: 'Email staf / praktisi yang akan diundang',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email calon staf wajib diisi' })
  email: string;

  @ApiProperty({
    example: 'b39c7891-3918-441d-9ec6-8f4e9f280e07',
    description: 'ID Peran dari tabel roles di database',
  })
  @IsUUID('4', { message: 'ID Peran harus berupa UUID valid' })
  @IsNotEmpty({ message: 'Peran wajib dipilih' })
  roleId: string;

  @ApiPropertyOptional({
    example: 'd9b04fc2-5f36-4c4b-873b-e0c1f2b6e123',
    description:
      'ID Poliklinik utama (opsional untuk staf non-klinis, disarankan untuk praktisi medis)',
  })
  @IsUUID('4', { message: 'ID Poliklinik harus UUID v4 valid' })
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({
    example: 'd9b04fc2-5f36-4c4b-873b-e0c1f2b6e123',
    description: 'ID Unit kerja klinik utama (opsional)',
  })
  @IsUUID('4', { message: 'ID Unit kerja harus UUID v4 valid' })
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({
    example: 'dr. Hendra Wijaya, Sp.A / Siti Aminah, A.Md.Keb / Budi Santoso',
    description: 'Nama lengkap calon pegawai (opsional)',
  })
  @IsString()
  @IsOptional()
  fullName?: string;
}
