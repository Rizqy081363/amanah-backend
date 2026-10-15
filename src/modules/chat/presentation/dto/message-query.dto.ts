import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class MessageQueryDto {
  @ApiPropertyOptional({
    description: 'Pagination cursor',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of messages to retrieve',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : 50))
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Guest ID if caller is unauthenticated guest',
  })
  @IsUUID('4')
  @IsOptional()
  guestId?: string;
}
