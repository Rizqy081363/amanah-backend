import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAdminDayStatusDto {
  @ApiProperty({
    description:
      'Status jadwal pada tanggal terkait (Buka, Penuh, Cuti, Tutup)',
    example: 'Cuti',
  })
  @IsNotEmpty()
  @IsString()
  status: string;

  @ApiPropertyOptional({
    description: 'Catatan operasional atau alasan cuti',
    example: 'Izin Dinas Luar Kota',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
