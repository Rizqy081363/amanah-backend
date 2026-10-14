import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ChatTicketDto {
  @ApiPropertyOptional({
    description: 'Guest client UUID for anonymous visitors',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  @IsOptional()
  guestId?: string;
}
