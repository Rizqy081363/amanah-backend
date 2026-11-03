import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RevertProposalDto {
  @ApiPropertyOptional({
    description: 'Alasan klinik membatalkan/revert persetujuan usulan',
    example: 'Klinik telah kembali beroperasi normal',
  })
  @IsOptional()
  @IsString({ message: 'Alasan harus berupa teks' })
  reason?: string;
}
