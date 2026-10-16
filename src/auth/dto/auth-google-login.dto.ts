import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AuthGoogleLoginDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
    description: 'ID Token dari Google Identity Service (JWT)',
  })
  @IsString({ message: 'Token Google harus berupa string' })
  @IsNotEmpty({ message: 'Token Google wajib disertakan' })
  idToken: string;

  @ApiPropertyOptional({
    example: 'mobile-internal',
    description:
      'Identitas permukaan klien (misal: mobile-internal untuk staf/dokter)',
  })
  @IsString()
  @IsOptional()
  clientId?: string;
}
