import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class AuthResetPasswordOtpDto {
  @ApiProperty({
    example: 'pasien@amanah.id',
    type: String,
    description: 'Alamat email akun terdaftar',
  })
  @Transform(lowerCaseTransformer)
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Kode OTP 6 digit dari email pemulihan',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: 'Kode OTP harus berupa teks' })
  @Length(6, 6, { message: 'Kode OTP harus 6 digit' })
  @IsNotEmpty({ message: 'Kode OTP tidak boleh kosong' })
  otp: string;

  @ApiProperty({
    example: 'NewSecureP@ssw0rd!2026',
    description: 'Kata sandi baru pengguna (minimal 8 karakter)',
    minLength: 8,
  })
  @IsNotEmpty({ message: 'Kata sandi tidak boleh kosong' })
  @IsString({ message: 'Kata sandi harus berupa teks' })
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter' })
  password: string;
}
