import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AdminConversationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by conversation status',
    enum: ['open', 'closed'],
    example: 'open',
  })
  @IsEnum(['open', 'closed'])
  @IsOptional()
  status?: 'open' | 'closed';

  @ApiPropertyOptional({
    description: 'Filter threads waiting for admin response',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1')
      return true;
    if (value === 'false' || value === false || value === 0 || value === '0')
      return false;
    return undefined;
  })
  awaitingReply?: boolean;

  @ApiPropertyOptional({
    description: 'Search customer name or email',
    example: 'Budi',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Pagination cursor (ISO timestamp string or UUID)',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Page size limit',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => (value ? Number.parseInt(value, 10) : 20))
  limit?: number = 20;
}
