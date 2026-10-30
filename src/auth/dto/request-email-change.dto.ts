import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional } from 'class-validator';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class RequestEmailChangeDto {
  @ApiProperty({
    description: 'Alamat email baru yang akan didaftarkan',
    example: 'admin.baru@amanah.com',
  })
  @IsNotEmpty({ message: 'Alamat email baru wajib diisi' })
  @IsEmail({}, { message: 'Format email baru tidak valid' })
  @Transform(lowerCaseTransformer)
  newEmail: string;

  @ApiPropertyOptional({
    description:
      'Kata sandi saat ini (wajib disertakan jika akun memiliki kredensial password)',
    example: 'secret123',
  })
  @IsOptional()
  currentPassword?: string;
}
