import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class ChangeAppointmentRoomDto {
  @ApiProperty({
    description: 'ID ruangan baru yang akan ditugaskan (UUID)',
    example: 'b77d141b-2fa5-4481-9f47-a5a040faf57a',
  })
  @IsUUID('4', { message: 'ID ruangan harus berformat UUID v4 valid' })
  @IsNotEmpty({ message: 'Target roomId wajib diisi' })
  roomId: string;
}
