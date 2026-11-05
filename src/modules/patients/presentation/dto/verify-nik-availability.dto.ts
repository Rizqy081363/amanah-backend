import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyNikAvailabilityDto {
  @ApiProperty({
    example: '3201234567890001',
    description: 'Nomor Induk Kependudukan (16 digit angka)',
  })
  @IsNotEmpty({ message: 'NIK wajib diisi' })
  @IsString({ message: 'NIK harus berupa string' })
  @Matches(/^\d{16}$/, { message: 'Format NIK harus 16 digit angka' })
  nik: string;
}
