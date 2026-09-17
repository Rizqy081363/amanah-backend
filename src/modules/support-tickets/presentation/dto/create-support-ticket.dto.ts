import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum TicketPriorityEnum {
  low = 'low',
  normal = 'normal',
  high = 'high',
  urgent = 'urgent',
}

export class CreateSupportTicketDto {
  @ApiProperty({
    example: 'Scanner QR poliklinik anak lambat membaca kode',
    description: 'Judul ringkas kendala teknis yang dilaporkan',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({
    example:
      'Kamera scanner di tablet poli anak membutuhkan waktu lebih dari 10 detik atau blank saat memindai QR presensi.',
    description: 'Penjelasan detail mengenai kendala teknis yang dialami',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    enum: TicketPriorityEnum,
    example: TicketPriorityEnum.normal,
    description: 'Tingkat urgensi tiket kendala',
  })
  @IsEnum(TicketPriorityEnum)
  @IsOptional()
  priority?: TicketPriorityEnum;

  @ApiPropertyOptional({
    example: 'mobile_app',
    description: 'Kanal asal laporan (mobile_app / web_dashboard)',
  })
  @IsString()
  @IsOptional()
  sourceChannel?: string;
}
