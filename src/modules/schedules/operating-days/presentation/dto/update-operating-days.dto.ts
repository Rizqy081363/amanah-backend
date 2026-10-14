import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateOperatingDayItemDto {
  @ApiProperty({
    description: 'Day of week (0 = Sunday .. 6 = Saturday)',
    example: 1,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dow!: number;

  @ApiProperty({
    description: 'Status aktif hari operasional klinik',
    example: true,
  })
  @IsBoolean()
  isActive!: boolean;
}

export class UpdateOperatingDaysBatchDto {
  @ApiProperty({
    description: 'Daftar pembaruan status hari operasional klinik',
    type: [UpdateOperatingDayItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateOperatingDayItemDto)
  days!: UpdateOperatingDayItemDto[];
}
