import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RespondProposalDto {
  @ApiProperty({
    description: 'Keputusan pasien terhadap pengajuan perubahan janji temu',
    enum: ['accepted', 'declined'],
    example: 'accepted',
  })
  @IsNotEmpty({ message: 'Keputusan (decision) wajib ditentukan' })
  @IsIn(['accepted', 'declined'], {
    message: 'Keputusan harus berupa "accepted" atau "declined"',
  })
  decision!: 'accepted' | 'declined';

  @ApiPropertyOptional({
    description: 'Catatan tambahan dari pasien atas keputusannya (opsional)',
    example: 'Saya setuju jadwal dialihkan ke sesi siang.',
  })
  @IsOptional()
  @IsString({ message: 'Catatan tambahan harus berupa teks' })
  notes?: string;
}
