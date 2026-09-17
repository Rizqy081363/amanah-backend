import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum LeaveReviewStatusEnum {
  DISETUJUI = 'DISETUJUI',
  DITOLAK = 'DITOLAK',
}

export class ReviewLeaveDto {
  @ApiProperty({
    enum: LeaveReviewStatusEnum,
    example: LeaveReviewStatusEnum.DISETUJUI,
    description: 'Status keputusan persetujuan cuti oleh Admin',
  })
  @IsEnum(LeaveReviewStatusEnum)
  @IsNotEmpty()
  status: LeaveReviewStatusEnum;

  @ApiPropertyOptional({
    example:
      'Disetujui, jadwal jaga selama tanggal tersebut telah dialihkan ke staf pengganti',
    description: 'Catatan atau pertimbangan keputusan persetujuan cuti',
  })
  @IsString()
  @IsOptional()
  approvalNotes?: string;
}
