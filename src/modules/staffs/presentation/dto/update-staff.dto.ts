import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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

  @ApiPropertyOptional({ example: 'Dokter Spesialis Anak Senior' })
  @IsString()
  @IsOptional()
  profession?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  poliklinikId?: string;

  @ApiPropertyOptional({
    description: 'Nomor Izin Praktik (SIP / STR) untuk dokter atau bidan',
    example: 'SIP.446/123/DISKES/2026',
  })
  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @ApiPropertyOptional({ example: '081299887711' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'ID Peran dinamis staf (FK ke tabel roles)',
    example: 'b5119e8f-f3b9-41b6-a21d-6116e0b3e03f',
  })
  @IsUUID()
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
