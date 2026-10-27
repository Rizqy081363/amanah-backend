import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject } from 'class-validator';

export class UpdateMedicalIntakeDto {
  @ApiProperty({
    example: {
      keluhanUtama: 'Batuk pilek sejak 2 hari yang lalu',
      riwayatAlergi: 'Alergi amoksisilin',
    },
    description: 'Jawaban isian kuesioner skrining / intake medis',
  })
  @IsObject()
  @IsNotEmpty()
  answers: Record<string, any>;
}
