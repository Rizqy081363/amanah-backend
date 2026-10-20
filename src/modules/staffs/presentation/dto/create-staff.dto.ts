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
    description: 'Tipe peran staf operasional: doctor, midwife, atau worker',
    enum: ['doctor', 'midwife', 'worker'],
    example: 'doctor',
  })
  @IsString()
  @IsOptional()
  staffType?: 'doctor' | 'midwife' | 'worker';

  @ApiPropertyOptional({ example: 'Jakarta' })
  @IsString()
  @IsOptional()
  birthPlace?: string;

  @ApiPropertyOptional({ example: '1985-05-20' })
  @IsString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({ enum: ['male', 'female'], example: 'male' })
  @IsString()
  @IsOptional()
  gender?: 'male' | 'female';

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
