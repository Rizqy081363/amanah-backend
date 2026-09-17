import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateScheduleDto {
  @ApiPropertyOptional({
    enum: ['PAGI', 'SIANG', 'MALAM'],
    example: 'SIANG',
  })
  @IsEnum(['PAGI', 'SIANG', 'MALAM'])
  @IsOptional()
  session?: 'PAGI' | 'SIANG' | 'MALAM';

  @ApiPropertyOptional({ example: '13:00' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 'Jadwal dimajukan 30 menit' })
  @IsString()
  @IsOptional()
  notes?: string;
}
