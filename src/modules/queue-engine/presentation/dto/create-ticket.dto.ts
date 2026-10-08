import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateQueueTicketDto {
  @ApiProperty({ description: 'Target Service Category ID' })
  @IsNotEmpty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ description: 'Target Session ID' })
  @IsNotEmpty()
  @IsUUID()
  sessionId: string;

  @ApiProperty({ description: 'Patient Profile ID' })
  @IsNotEmpty()
  @IsUUID()
  patientId: string;

  @ApiProperty({ description: 'Service Date in YYYY-MM-DD' })
  @IsNotEmpty()
  @IsDateString()
  serviceDate: string;

  @ApiProperty({ required: false, description: 'Medical complaint note' })
  @IsOptional()
  @IsString()
  complaint?: string;
}

export class RescheduleQueueTicketDto {
  @ApiProperty({ description: 'Target Service Date in YYYY-MM-DD' })
  @IsNotEmpty()
  @IsDateString()
  serviceDate: string;

  @ApiProperty({ description: 'Target Session ID' })
  @IsNotEmpty()
  @IsUUID()
  sessionId: string;

  @ApiProperty({ required: false, description: 'Reschedule reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}
