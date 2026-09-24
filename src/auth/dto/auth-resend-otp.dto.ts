import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty } from 'class-validator';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';

export type OtpType = 'email-verification' | 'forgot-password';

export class AuthResendOtpDto {
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
    example: 'email-verification',
    enum: ['email-verification', 'forgot-password'],
    description:
      'Tujuan pengiriman ulang kode OTP (email-verification atau forgot-password)',
  })
  @IsIn(['email-verification', 'forgot-password'], {
    message: 'Tipe OTP harus email-verification atau forgot-password',
  })
  @IsNotEmpty({ message: 'Tipe OTP tidak boleh kosong' })
  type: OtpType;
}

export class ResendOtpResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: 'Kode OTP baru berhasil dikirim ke email Anda.',
  })
  message: string;

  @ApiProperty({
    example: 60,
    description:
      'Durasi cooldown dalam detik sebelum permintaan berikutnya diizinkan',
  })
  cooldownSeconds: number;
}
