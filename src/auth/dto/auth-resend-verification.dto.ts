import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class AuthResendVerificationDto {
  @ApiProperty({
    example: 'pasien@amanah.id',
    type: String,
    description: 'Alamat email akun yang perlu diverifikasi',
  })
  @Transform(lowerCaseTransformer)
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email: string;
}
