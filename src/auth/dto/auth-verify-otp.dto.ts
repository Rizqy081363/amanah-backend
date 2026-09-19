import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class AuthVerifyOtpDto {
  @ApiProperty({
    example: 'pasien@amanah.id',
    type: String,
    description: 'Alamat email akun yang diverifikasi',
  })
  @Transform(lowerCaseTransformer)
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'Kode verifikasi OTP 6 digit',
    minLength: 6,
    maxLength: 6,
  })
  @IsString({ message: 'Kode OTP harus berupa teks' })
  @Length(6, 6, { message: 'Kode OTP harus 6 digit' })
  @IsNotEmpty({ message: 'Kode OTP tidak boleh kosong' })
  otp: string;
}
