import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Kata sandi saat ini yang digunakan untuk otentikasi',
    example: 'secret123',
  })
  @IsNotEmpty({ message: 'Kata sandi saat ini wajib diisi' })
  currentPassword: string;

  @ApiProperty({
    description: 'Kata sandi baru (minimal 6 karakter)',
    example: 'newSecretPass123',
    minLength: 6,
  })
  @IsNotEmpty({ message: 'Kata sandi baru wajib diisi' })
  @MinLength(6, { message: 'Kata sandi baru minimal 6 karakter' })
  newPassword: string;
}
