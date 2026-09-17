import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PrescriptionItemDto } from './create-medical-record.dto';

export class UpdateDiagnosisDto {
  @ApiPropertyOptional({
    example: 'Hiperemesis Gravidarum Tingkat 1, Anemia Ringan',
    description: 'Diagnosa kerja dokter/bidan',
  })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiPropertyOptional({
    example: 'O21.0',
    description: 'Kode Diagnosa ICD-10',
  })
  @IsString()
  @IsOptional()
  diagnosisIcd10Code?: string;

  @ApiPropertyOptional({
    example: 'Mild hyperemesis gravidarum',
    description: 'Deskripsi ICD-10',
  })
  @IsString()
  @IsOptional()
  diagnosisIcd10Name?: string;

  @ApiPropertyOptional({
    example: 'Injeksi Ondansetron 4mg IV, rehidrasi RL 500ml',
    description: 'Tindakan medis yang dilakukan',
  })
  @IsString()
  @IsOptional()
  tindakan?: string;

  @ApiPropertyOptional({
    example: 'Tablet Tambah Darah 1x1, Vitamin B6 3x1',
    description: 'Catatan resep obat (string)',
  })
  @IsString()
  @IsOptional()
  resepObat?: string;

  @ApiPropertyOptional({
    type: [PrescriptionItemDto],
    description: 'Daftar item resep obat terstruktur',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  @IsOptional()
  prescriptions?: PrescriptionItemDto[];

  @ApiPropertyOptional({
    example:
      'Minum air sedikit demi sedikit, kontrol ulang bila muntah berlanjut',
    description: 'Catatan medis / saran edukasi',
  })
  @IsString()
  @IsOptional()
  catatanMedis?: string;

  @ApiPropertyOptional({
    enum: ['planned', 'in_progress', 'completed', 'cancelled'],
    example: 'completed',
    description: 'Perubahan status encounter',
  })
  @IsEnum(['planned', 'in_progress', 'completed', 'cancelled'])
  @IsOptional()
  status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';
}
