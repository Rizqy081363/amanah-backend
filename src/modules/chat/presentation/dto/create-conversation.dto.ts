import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateConversationDto {
  @ApiPropertyOptional({
    description:
      'Persistent guest client UUID from localStorage (for landing-page visitors)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  @IsOptional()
  guestId?: string;

  @ApiPropertyOptional({
    description: 'Guest full name',
    example: 'Budi Guest',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Guest email address',
    example: 'budi.guest@test.com',
  })
  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;
}
