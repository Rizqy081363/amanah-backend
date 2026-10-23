import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignReplacementDto {
  @ApiProperty({
    example: '52b4d315-75ec-41d9-b139-d1a8dfeaea97',
    description: 'ID profil staf klinik yang ditugaskan sebagai pengganti',
  })
  @IsUUID()
  @IsNotEmpty()
  staffProfileId: string;

  @ApiPropertyOptional({
    example: 'd403922c-2da2-4191-a04b-c9d6ce0e513a',
    description: 'ID practitioner (dokter) jika staf memiliki profil dokter',
  })
  @IsUUID()
  @IsOptional()
  practitionerId?: string;

  @ApiPropertyOptional({
    example: 'Ditugaskan oleh admin untuk dinas pengganti',
    description: 'Catatan tambahan penugasan',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
