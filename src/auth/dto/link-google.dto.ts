import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class LinkGoogleDto {
  @ApiProperty({
    description: 'ID token Google OAuth yang diperoleh dari Google Sign-In SDK',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...google-id-token',
  })
  @IsNotEmpty({ message: 'Google ID token wajib disertakan' })
  idToken: string;
}
