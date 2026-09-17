import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateMedicalIntakeDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID Kunjungan / Appointment terkait (opsional)',
  })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'ID Pasien (patientProfiles.id)',
  })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({
    enum: ['pregnancy', 'immunization'],
    example: 'pregnancy',
    description: 'Jenis alur skrining intake medis',
  })
  @IsEnum(['pregnancy', 'immunization'])
  @IsNotEmpty()
  flow: 'pregnancy' | 'immunization';

  @ApiPropertyOptional({
    example: 'v1',
    default: 'v1',
    description: 'Versi skema kuesioner intake',
  })
  @IsString()
  @IsOptional()
  schemaVersion?: string;

  @ApiProperty({
    example: 'Formulir Skrining Mandiri Kehamilan Trimester 1',
    description: 'Judul kuesioner skrining medis',
  })
  @IsString()
  @IsNotEmpty()
  schemaTitle: string;

  @ApiProperty({
    example: {
      keluhanUtama: 'Mual muntah hebat di pagi hari',
      riwayatAlergi: 'Tidak ada',
      hpht: '2026-01-10',
      merokok: false,
      riwayatHipertensi: false,
    },
    description:
      'Jawaban isian kuesioner skrining oleh pasien / perawat triage',
  })
  @IsObject()
  @IsNotEmpty()
  answers: Record<string, any>;

  @ApiPropertyOptional({
    example: {
      skorRisiko: 2,
      usiaKehamilanMinggu: 9,
      perkiraanLahir: '2026-10-17',
    },
    description: 'Hasil kalkulasi otomatis sistem',
  })
  @IsObject()
  @IsOptional()
  automatic?: Record<string, any>;
}
