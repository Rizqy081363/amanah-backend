import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewLeaveDto {
  @ApiProperty({
    example: 'approved',
    enum: ['approved', 'rejected', 'DISETUJUI', 'DITOLAK'],
    description: 'Status keputusan persetujuan cuti oleh Admin',
  })
  @IsIn(['approved', 'rejected', 'DISETUJUI', 'DITOLAK'])
  @IsNotEmpty()
  status: 'approved' | 'rejected' | 'DISETUJUI' | 'DITOLAK';

  @ApiPropertyOptional({
    example: 'Disetujui untuk tanggal dinas terkait',
    description: 'Catatan atau pertimbangan keputusan persetujuan cuti',
  })
  @IsString()
  @IsOptional()
  approvalNotes?: string;
}
