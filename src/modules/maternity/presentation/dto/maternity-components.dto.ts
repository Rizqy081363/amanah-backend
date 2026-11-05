import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { gender, type Gender } from '../../../../database/schema';

export class HusbandProfileDto {
  @ApiProperty({ example: 'Ahmad Fauzi', description: 'Nama lengkap suami' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiPropertyOptional({
    example: '3201234567890002',
    description: 'NIK suami 16 digit',
  })
  @IsString()
  @Length(16, 16)
  @IsOptional()
  nik?: string;

  @ApiPropertyOptional({
    example: '1993-02-18',
    description: 'Tanggal lahir suami (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({ example: 31, description: 'Umur suami saat ini' })
  @IsInt()
  @IsOptional()
  age?: number;

  @ApiPropertyOptional({
    example: 'Karyawan Swasta',
    description: 'Pekerjaan suami',
  })
  @IsString()
  @IsOptional()
  job?: string;

  @ApiPropertyOptional({
    example: 'S1',
    description: 'Pendidikan terakhir suami',
  })
  @IsString()
  @IsOptional()
  education?: string;

  @ApiPropertyOptional({
    example: 'B',
    description: 'Golongan darah suami',
  })
  @IsString()
  @IsOptional()
  bloodType?: string;

  @ApiPropertyOptional({
    example: '081234567891',
    description: 'Nomor telepon suami',
  })
  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

export class PreviousPregnancyItemDto {
  @ApiProperty({ example: 1, description: 'Urutan riwayat kehamilan (1..10)' })
  @IsInt()
  @Min(1)
  @Max(20)
  orderNumber!: number;

  @ApiPropertyOptional({
    example: '2024',
    description: 'Tahun lahir atau berakhir',
  })
  @IsString()
  @IsOptional()
  birthYear?: string;

  @ApiPropertyOptional({
    example: 3200,
    description: 'Berat lahir bayi dalam gram',
  })
  @IsInt()
  @IsOptional()
  birthWeightGrams?: number;

  @ApiPropertyOptional({
    example: 49.5,
    description: 'Panjang badan lahir (cm)',
  })
  @IsNumber()
  @IsOptional()
  birthLengthCm?: number;

  @ApiPropertyOptional({
    enum: gender.enumValues,
    example: 'female',
  })
  @IsIn(gender.enumValues)
  @IsOptional()
  childSex?: Gender;

  @ApiPropertyOptional({
    example: '39 minggu',
    description: 'Usia kehamilan saat lahir',
  })
  @IsString()
  @IsOptional()
  gestationalAgeAtBirth?: string;

  @ApiPropertyOptional({
    example: 'bidan',
    description: 'Tenaga penolong persalinan',
  })
  @IsString()
  @IsOptional()
  birthAttendant?: string;

  @ApiPropertyOptional({
    example: 'normal_spontan',
    description: 'Metode persalinan',
  })
  @IsString()
  @IsOptional()
  deliveryMethod?: string;

  @ApiPropertyOptional({
    example: 'klinik_bersalin',
    description: 'Tempat persalinan',
  })
  @IsString()
  @IsOptional()
  deliveryPlace?: string;

  @ApiPropertyOptional({
    example: 'Tidak ada komplikasi',
    description: 'Komplikasi jika ada',
  })
  @IsString()
  @IsOptional()
  complications?: string;
}

export class ContraceptiveHistoryItemDto {
  @ApiProperty({
    example: 1,
    description: 'Urutan riwayat pemakaian KB (1..10)',
  })
  @IsInt()
  @Min(1)
  @Max(20)
  orderNumber!: number;

  @ApiPropertyOptional({
    example: '2022-05-10',
    description: 'Tanggal mulai pemakaian',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: 'suntik_3_bulan',
    description: 'Jenis alat kontrasepsi',
  })
  @IsString()
  @IsOptional()
  contraceptiveType?: string;

  @ApiPropertyOptional({ example: '2 tahun', description: 'Lama pemakaian' })
  @IsString()
  @IsOptional()
  durationText?: string;

  @ApiPropertyOptional({
    example: '2024-05-10',
    description: 'Tanggal berhenti / lepas',
  })
  @IsDateString()
  @IsOptional()
  stopDate?: string;

  @ApiPropertyOptional({
    example: 'Tidak ada',
    description: 'Kendala atau masalah pemakaian',
  })
  @IsString()
  @IsOptional()
  problems?: string;

  @ApiPropertyOptional({
    example: 'Flek ringan',
    description: 'Efek samping yang dirasakan',
  })
  @IsString()
  @IsOptional()
  sideEffects?: string;
}

export class HealthConditionResponseDto {
  @ApiProperty({
    example: 'hipertensi',
    description: 'Kode unik kondisi kesehatan (14 katalog kanonik)',
  })
  @IsString()
  @IsNotEmpty()
  conditionCode!: string;

  @ApiProperty({
    example: true,
    description: 'Apakah pasien memiliki atau pernah mengalami kondisi ini',
  })
  @IsBoolean()
  hasCondition!: boolean;

  @ApiPropertyOptional({
    example: 2021,
    description: 'Tahun terdiagnosis (1900 s.d. tahun saat ini)',
  })
  @IsInt({ message: 'Tahun terdiagnosis harus berupa bilangan bulat (angka)' })
  @Min(1900, { message: 'Tahun terdiagnosis tidak boleh lebih awal dari 1900' })
  @Max(new Date().getFullYear(), {
    message: 'Tahun terdiagnosis tidak boleh melebihi tahun saat ini',
  })
  @IsOptional()
  diagnosisYear?: number;

  @ApiPropertyOptional({
    example: 'Minum amlodipin rutin',
    description: 'Catatan tambahan pengobatan atau gejala',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
