import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTicketMessageDto {
  @ApiProperty({
    example:
      'Sudah dicoba restart tablet poli, namun kamera masih blank hitam setelah aplikasi dibuka kembali.',
    description: 'Isi teks pesan chat/balasan laporan kendala ke teknisi IT',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}
