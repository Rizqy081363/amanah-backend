import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LinkGoogleDto {
  @ApiPropertyOptional({
    description: 'ID token Google OAuth yang diperoleh dari Google Sign-In SDK',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...google-id-token',
  })
  @IsOptional()
  @IsString()
  idToken?: string;

  @ApiPropertyOptional({
    description:
      'Authorization code dari Google OAuth 2.0 Consent popup window',
    example: '4/0AbUR2VO...',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description: 'Redirect URI yang digunakan saat meminta authorization code',
    example: 'http://localhost:3000/auth/oauth-callback',
  })
  @IsOptional()
  @IsString()
  redirectUri?: string;
}
