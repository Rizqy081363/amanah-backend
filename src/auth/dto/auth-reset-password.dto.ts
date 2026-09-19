import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AuthResetPasswordDto {
  @ApiProperty({
    description: 'Kata sandi baru pengguna (minimal 8 karakter)',
    example: 'NewSecureP@ssw0rd!2026',
    minLength: 8,
  })
  @IsNotEmpty({ message: 'Kata sandi tidak boleh kosong' })
  @IsString({ message: 'Kata sandi harus berupa teks' })
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter' })
  password: string;

  @ApiProperty({
    description: 'Token hash reset kata sandi',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsNotEmpty({ message: 'Token reset kata sandi tidak boleh kosong' })
  @IsString({ message: 'Token reset kata sandi harus berupa teks' })
  hash: string;
}
