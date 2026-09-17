import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}
