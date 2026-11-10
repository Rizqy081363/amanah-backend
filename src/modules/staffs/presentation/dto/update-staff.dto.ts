import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { gender, type Gender } from '../../../../database/schema';

export class UpdateStaffAddressDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  provinceName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  regencyCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  regencyName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  districtCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  districtName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  villageCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  villageName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  line1?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  fullAddress?: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({ example: 'Dr. Hendra Wijaya, Sp.A, M.Kes' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: 'Dokter Spesialis Anak Senior', nullable: true })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  profession?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  poliklinikId?: string | null;

  @ApiPropertyOptional({
    description: 'Nomor Izin Praktik (SIP / STR) untuk dokter atau bidan',
    example: 'SIP.446/123/DISKES/2026',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  licenseNumber?: string | null;

  @ApiPropertyOptional({ example: '081299887711' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'ID Peran dinamis staf (FK ke tabel roles)',
    example: 'b5119e8f-f3b9-41b6-a21d-6116e0b3e03f',
    nullable: true,
  })
  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  roleId?: string | null;

  @ApiPropertyOptional({ example: 'Jakarta', nullable: true })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  birthPlace?: string | null;

  @ApiPropertyOptional({ example: '1985-05-20', nullable: true })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  birthDate?: string | null;

  @ApiPropertyOptional({ enum: gender.enumValues, example: 'male' })
  @IsString()
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ example: '3171234567890001', nullable: true })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  nationalId?: string | null;

  @ApiPropertyOptional({ example: 'staff@example.com' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ type: () => UpdateStaffAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateStaffAddressDto)
  address?: UpdateStaffAddressDto;
}
