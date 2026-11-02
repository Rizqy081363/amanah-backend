import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ProposeCancellationDto {
  @ApiProperty({
    description: 'Alasan klinik mengajukan pembatalan janji temu pasien',
    example: 'Klinik mengalami renovasi mendadak pada unit layanan terkait',
  })
  @IsNotEmpty({ message: 'Alasan pengajuan pembatalan wajib diisi' })
  @IsString({ message: 'Alasan pengajuan pembatalan harus berupa teks' })
  reason!: string;
}
