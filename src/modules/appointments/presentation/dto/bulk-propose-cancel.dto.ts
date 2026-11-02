import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class BulkProposeCancelDto {
  @ApiProperty({
    description: 'Daftar ID janji temu pasien yang akan diajukan pembatalan',
    example: ['0d32bb39-b9d6-44c1-8406-fc5a0b73c4f7'],
    type: [String],
  })
  @IsArray({ message: 'Daftar appointmentIds harus berupa array' })
  @ArrayNotEmpty({ message: 'Minimal harus ada 1 janji temu yang dipilih' })
  @IsUUID('4', {
    each: true,
    message: 'Setiap appointment ID harus berupa UUID v4 yang valid',
  })
  appointmentIds!: string[];

  @ApiProperty({
    description: 'Alasan klinik mengajukan pembatalan janji temu pasien',
    example: 'Klinik mengalami renovasi mendadak pada unit layanan terkait',
  })
  @IsNotEmpty({ message: 'Alasan pengajuan pembatalan wajib diisi' })
  @IsString({ message: 'Alasan pengajuan pembatalan harus berupa teks' })
  reason!: string;
}
