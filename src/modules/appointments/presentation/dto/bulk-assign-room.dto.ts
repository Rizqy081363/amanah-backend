import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsUUID } from 'class-validator';

export class BulkAssignRoomDto {
  @ApiProperty({
    description: 'Daftar ID unik janji temu pasien (UUID)',
    example: ['6d3a26e2-77fb-466d-9096-d3b2400c443d'],
    type: [String],
  })
  @IsArray({ message: 'appointmentIds harus berupa array UUID' })
  @ArrayNotEmpty({ message: 'appointmentIds tidak boleh kosong' })
  @IsUUID('4', { each: true, message: 'Setiap appointmentId harus berformat UUID v4 valid' })
  appointmentIds: string[];

  @ApiProperty({
    description: 'ID ruangan periksa tujuan yang akan ditugaskan (UUID)',
    example: 'b77d141b-2fa5-4481-9f47-a5a040faf57a',
  })
  @IsUUID('4', { message: 'roomId harus berformat UUID v4 valid' })
  @IsNotEmpty({ message: 'roomId wajib diisi' })
  roomId: string;
}
