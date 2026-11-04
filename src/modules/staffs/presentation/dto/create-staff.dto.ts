import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { gender, type Gender } from '../../../../database/schema';

export class CreateStaffDto {
  @ApiProperty({ example: 'Dr. Hendra Wijaya, Sp.A' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: 'Dokter Spesialis Anak' })
  @IsString()
  @IsNotEmpty()
  profession: string;

  @ApiPropertyOptional({ description: 'ID Poliklinik Unit' })
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({
    example: 'DOC-AMANAH-002',
    description: 'Kode Staf Pegawai',
  })
  @IsString()
  @IsOptional()
  staffCode?: string;

  @ApiPropertyOptional({
    example: 'DOC-AMANAH-002',
    description: 'Nomor Kartu Staf / ID Digital',
  })
  @IsString()
  @IsOptional()
  idCardNumber?: string;

  @ApiProperty({ example: '081299887766' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'ID Akun User jika ada' })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: 'ID Peran dari tabel roles di database',
    example: 'b39c7891-3918-441d-9ec6-8f4e9f280e07',
  })
  @IsString()
  @IsOptional()
  roleId?: string;

  @ApiPropertyOptional({ example: 'Jakarta' })
  @IsString()
  @IsOptional()
  birthPlace?: string;

  @ApiPropertyOptional({ example: '1985-05-20' })
  @IsString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({ enum: gender.enumValues, example: 'male' })
  @IsString()
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ example: '3171234567890001' })
  @IsString()
  @IsOptional()
  nationalId?: string;

  @ApiPropertyOptional({ example: 'staff@example.com' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}
