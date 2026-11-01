import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LinkedProvidersResponseDto {
  @ApiProperty({
    type: [String],
    description:
      'Daftar provider autentikasi yang sedang terhubung ke akun (credential, google)',
    example: ['credential', 'google'],
  })
  linkedProviders: string[];

  @ApiProperty({
    description:
      'Menandakan apakah akun memiliki kredensial login kata sandi aktif',
    example: true,
  })
  hasPassword: boolean;

  @ApiProperty({
    description: 'Menandakan apakah akun terhubung dengan login Google OAuth',
    example: false,
  })
  hasGoogle: boolean;

  @ApiPropertyOptional({
    description: 'Alamat email akun saat ini',
    example: 'admin@amanah.com',
  })
  email: string;

  @ApiPropertyOptional({
    description: 'Google Client ID resmi dari backend untuk inisiasi OAuth',
    example:
      '649477011186-augsamgganq024tesomp0c8rvgs9c7ua.apps.googleusercontent.com',
  })
  googleClientId?: string;
}
