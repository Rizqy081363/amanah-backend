import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PurgedDetailsDto {
  @ApiProperty({
    example: 'c759fc6b-1db5-4d8f-b4a0-32fb3b7e8934',
    description: 'ID unik pengguna yang telah dihapus',
  })
  userId!: string;

  @ApiPropertyOptional({
    example: 'pasien@amanah.health',
    description: 'Alamat email pengguna yang telah dihapus',
  })
  email?: string;
}

export class DeleteAccountResponseDto {
  @ApiProperty({
    example: true,
    description: 'Status keberhasilan pembersihan akun sistemik',
  })
  success!: boolean;

  @ApiProperty({
    example:
      'Akun dan seluruh data pengguna terkait telah berhasil dihapus secara permanen dari sistem.',
    description: 'Pesan konfirmasi keberhasilan',
  })
  message!: string;

  @ApiProperty({
    example: '2026-09-19T16:50:00.000Z',
    description: 'Waktu ISO penghapusan data secara tuntas',
  })
  purgedAt!: string;

  @ApiPropertyOptional({
    type: PurgedDetailsDto,
    description: 'Rincian identitas akun yang telah dihapus',
  })
  details?: PurgedDetailsDto;
}
