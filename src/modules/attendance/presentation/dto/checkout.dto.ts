import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CheckOutDto {
  @ApiPropertyOptional({
    description: 'ID profil staf opsional jika dilakukan oleh Admin',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional({
    description: 'Token QR dinamis dari terminal klinik (6-digit token atau kode)',
    example: 'D3F9A1',
  })
  @IsString()
  @IsOptional()
  qrToken?: string;

  @ApiPropertyOptional({
    description: 'Catatan alasan kepulangan darurat / pulang awal jika sebelum jadwal usai',
    example: 'Kondisi medis darurat: Sakit kepala hebat',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Tiket verifikasi presensi pulang awal berbatas waktu 3 menit dari scan terminal fisik',
    example: 'eyJnZW4iOjF9.signature...',
  })
  @IsString()
  @IsOptional()
  checkoutTicket?: string;
}
