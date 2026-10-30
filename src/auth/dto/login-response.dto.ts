import { ApiProperty } from '@nestjs/swagger';
import { AuthUserResponseDto } from './auth-user-response.dto';

export class LoginResponseDto {
  @ApiProperty()
  token: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  tokenExpires: number;

  @ApiProperty({
    type: () => AuthUserResponseDto,
    description: 'Profil pengguna terautentikasi berserta perannya',
  })
  user: AuthUserResponseDto;
}
