import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateClosureDto {
  @ApiProperty({
    enum: ['clinic', 'category', 'doctor', 'room'],
    default: 'clinic',
  })
  @IsNotEmpty()
  @IsIn(['clinic', 'category', 'doctor', 'room'])
  scope: 'clinic' | 'category' | 'doctor' | 'room';

  @ApiProperty({ enum: ['day', 'session', 'range'], default: 'range' })
  @IsNotEmpty()
  @IsIn(['day', 'session', 'range'])
  inputKind: 'day' | 'session' | 'range';

  @ApiProperty({ description: 'Start timestamp in ISO string' })
  @IsNotEmpty()
  @IsDateString()
  startsAt: string;

  @ApiProperty({ description: 'End timestamp in ISO string' })
  @IsNotEmpty()
  @IsDateString()
  endsAt: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lastCallBufferMin?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CallNextDto {
  @ApiProperty({ description: 'Practitioner ID making the call' })
  @IsNotEmpty()
  @IsUUID()
  doctorId: string;

  @ApiProperty({ required: false, description: 'Filter by category ID' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ required: false, description: 'Service date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  serviceDate?: string;
}
