import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'Text content of the chat message',
    example: 'Halo, apakah poli anak buka hari ini?',
    maxLength: 4000,
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({
    message: 'Pesan tidak boleh kosong / Message body cannot be empty',
  })
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({
    description:
      'Client-generated UUID for idempotency and optimistic UI deduplication',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  @IsOptional()
  clientMessageId?: string;

  @ApiPropertyOptional({
    description: 'Guest identifier for guest session validation',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  @IsOptional()
  guestId?: string;
}
