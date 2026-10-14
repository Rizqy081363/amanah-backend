import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkDeletePatientsDto {
  @ApiProperty({
    type: [String],
    description: 'Daftar ID pasien (UUID) yang akan dinonaktifkan',
    example: ['a8e79644-a541-4d05-b431-99c99d8620ec'],
  })
  @IsArray()
  @IsUUID('4', {
    each: true,
    message: 'Setiap ID harus berupa UUID v4 yang valid',
  })
  @ArrayMinSize(1, { message: 'Minimal sertakan 1 ID pasien untuk dihapus' })
  ids: string[];
}
