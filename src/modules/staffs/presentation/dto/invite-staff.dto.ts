import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class InviteStaffDto {
  @ApiProperty({
    example: 'staf.admin@example.com',
    description: 'Email staf operasional yang akan diundang',
  })
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email staf wajib diisi' })
  email: string;

  @ApiPropertyOptional({
    example: 'Budi Santoso',
    description: 'Nama lengkap staf (opsional, dapat diisi mandiri saat login)',
  })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({
    example: 'staff_worker',
    description:
      'Peran sistem operasional: default staff_worker',
    enum: ['staff_worker'],
    default: 'staff_worker',
  })
  @IsIn(['staff_worker'], {
    message: 'Peran staf harus staff_worker',
  })
  @IsOptional()
  roleCode?: 'staff_worker' = 'staff_worker';
}

