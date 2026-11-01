import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export class VerifyEmailChangeDto {
  @ApiProperty({
    description: 'Alamat email baru yang didaftarkan',
    example: 'staf.baru@amanah.com',
  })
  @IsNotEmpty({ message: 'Alamat email baru wajib diisi' })
  @IsEmail({}, { message: 'Format email baru tidak valid' })
  @Transform(lowerCaseTransformer)
  newEmail: string;

  @ApiProperty({
    description: 'Kode OTP 6 digit yang diterima di email baru',
    example: '123456',
  })
  @IsNotEmpty({ message: 'Kode OTP wajib diisi' })
  @IsString({ message: 'Kode OTP harus berupa teks' })
  @Length(6, 6, { message: 'Kode OTP harus 6 digit' })
  @Matches(/^\d{6}$/, { message: 'Kode OTP hanya boleh berisi angka' })
  otp: string;
}
