import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AnamnesisResponseDto,
  HealthConditionResponseDto,
  HusbandProfileDto,
} from './maternal-normalized-intake.dto';

export class PreviousPregnancyItemDto {
  @ApiProperty({ example: 1, description: 'Urutan riwayat kehamilan (1..4)' })
  @IsInt()
  @Min(1)
  @Max(4)
  orderNumber: number;

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
    enum: ['Laki-laki', 'Perempuan'],
    example: 'Perempuan',
  })
  @IsIn(['Laki-laki', 'Perempuan'])
  @IsOptional()
  childSex?: string;

  @ApiPropertyOptional({
    example: '39 minggu',
    description: 'Usia kehamilan saat lahir',
  })
  @IsString()
  @IsOptional()
  gestationalAgeAtBirth?: string;

  @ApiPropertyOptional({
    example: 'Bidan',
    description: 'Tenaga penolong persalinan',
  })
  @IsString()
  @IsOptional()
  birthAttendant?: string;

  @ApiPropertyOptional({
    example: 'Normal/spontan',
    description: 'Metode persalinan',
  })
  @IsString()
  @IsOptional()
  deliveryMethod?: string;

  @ApiPropertyOptional({
    example: 'Klinik Amanah',
    description: 'Tempat persalinan',
  })
  @IsString()
  @IsOptional()
  deliveryPlace?: string;

  @ApiPropertyOptional({
    example: 'Tidak ada',
    description: 'Komplikasi jika ada',
  })
  @IsString()
  @IsOptional()
  complications?: string;
}

export class ContraceptiveHistoryItemDto {
  @ApiProperty({
    example: 1,
    description: 'Urutan riwayat pemakaian KB (1..4)',
  })
  @IsInt()
  @Min(1)
  @Max(4)
  orderNumber: number;

  @ApiPropertyOptional({
    example: '2022-05-10',
    description: 'Tanggal mulai pemakaian',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: 'Suntik 3 bulan',
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

export class CreateMaternityIntakeDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({ example: 'Siti Aminah' })
  @IsString()
  @IsOptional()
  motherName?: string;

  @ApiPropertyOptional({ example: '3201234567890001' })
  @IsString()
  @Length(16, 16)
  @IsOptional()
  motherNik?: string;

  @ApiPropertyOptional({ example: '1995-04-12' })
  @IsDateString()
  @IsOptional()
  motherBirthDate?: string;

  @ApiPropertyOptional({ example: 29 })
  @IsInt()
  @IsOptional()
  motherAge?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  marriageOrder?: number;

  @ApiPropertyOptional({ example: '2020-08-15' })
  @IsDateString()
  @IsOptional()
  marriageDate?: string;

  @ApiPropertyOptional({ example: 'Ibu Rumah Tangga' })
  @IsString()
  @IsOptional()
  motherJob?: string;

  @ApiPropertyOptional({ example: 'S1' })
  @IsString()
  @IsOptional()
  motherEducation?: string;

  @ApiPropertyOptional({ example: 'Islam' })
  @IsString()
  @IsOptional()
  religion?: string;

  @ApiPropertyOptional({ example: '081234567890' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'Jl. Anyelir 1 No. 243, Condongcatur' })
  @IsString()
  @IsOptional()
  domicileAddress?: string;

  @ApiPropertyOptional({ example: 'Jl. Anyelir 1 No. 243, Condongcatur' })
  @IsString()
  @IsOptional()
  identityCardAddress?: string;

  @ApiPropertyOptional({ example: 'Melati 3' })
  @IsString()
  @IsOptional()
  dasawisma?: string;

  @ApiPropertyOptional({ example: 'Posyandu Mawar' })
  @IsString()
  @IsOptional()
  posyandu?: string;

  @ApiPropertyOptional({ example: 'Puskesmas Depok II' })
  @IsString()
  @IsOptional()
  puskesmas?: string;

  @ApiPropertyOptional({ example: 'Ahmad Fauzi' })
  @IsString()
  @IsOptional()
  partnerName?: string;

  @ApiPropertyOptional({ example: '3201234567890002' })
  @IsString()
  @IsOptional()
  partnerNik?: string;

  @ApiPropertyOptional({ example: '1993-02-18' })
  @IsDateString()
  @IsOptional()
  partnerBirthDate?: string;

  @ApiPropertyOptional({ example: 31 })
  @IsInt()
  @IsOptional()
  partnerAge?: number;

  @ApiPropertyOptional({ example: 'Karyawan Swasta' })
  @IsString()
  @IsOptional()
  partnerJob?: string;

  @ApiPropertyOptional({ example: 'S1' })
  @IsString()
  @IsOptional()
  partnerEducation?: string;

  @ApiPropertyOptional({ example: 'B' })
  @IsString()
  @IsOptional()
  partnerBloodType?: string;

  @ApiPropertyOptional({ example: 158 })
  @IsNumber()
  @IsOptional()
  heightCm?: number;

  @ApiPropertyOptional({ example: 52 })
  @IsNumber()
  @IsOptional()
  prePregnancyWeightKg?: number;

  @ApiPropertyOptional({ example: 24.5 })
  @IsNumber()
  @IsOptional()
  upperArmCircumferenceCm?: number;

  @ApiPropertyOptional({ example: 20.8 })
  @IsNumber()
  @IsOptional()
  initialBmi?: number;

  @ApiPropertyOptional({ example: 'T2' })
  @IsString()
  @IsOptional()
  tetanusStatus?: string;

  @ApiPropertyOptional({ example: 'O' })
  @IsString()
  @IsOptional()
  motherBloodType?: string;

  @ApiPropertyOptional({ example: '2026-01-10' })
  @IsDateString()
  @IsOptional()
  hpht?: string;

  @ApiPropertyOptional({ example: '2026-10-17' })
  @IsDateString()
  @IsOptional()
  estimatedDueDate?: string;

  @ApiPropertyOptional({ example: 10.5 })
  @IsNumber()
  @IsOptional()
  gestationalAgeWeeks?: number;

  @ApiPropertyOptional({ example: '10 minggu 3 hari' })
  @IsString()
  @IsOptional()
  gestationalAgeFormatted?: string;

  @ApiProperty({
    example: 'Mual muntah hebat di pagi hari, nafsu makan menurun',
  })
  @IsString()
  @IsNotEmpty()
  currentComplaints: string;

  @ApiProperty({ example: 2, default: 1 })
  @IsInt()
  @Min(1)
  gravidaCount: number;

  @ApiProperty({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  parityCount: number;

  @ApiProperty({ example: 0, default: 0 })
  @IsInt()
  @Min(0)
  abortionCount: number;

  @ApiProperty({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  livingChildrenCount: number;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  hasPreviousPregnancyHistory?: boolean;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  hasContraceptionHistory?: boolean;

  @ApiPropertyOptional({ example: 'Tidak' })
  @IsString()
  @IsOptional()
  smokedBeforePregnancy?: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  alcoholBeforePregnancy?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  irregularDietBeforePregnancy?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  reducedPhysicalActivityBeforePregnancy?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  unprescribedMedicationBeforePregnancy?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  concerningCosmeticUseBeforePregnancy?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  pesticideExposureBeforePregnancy?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  chemicalExposureBeforePregnancy?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  smokeExposureBeforePregnancy?: boolean;

  @ApiPropertyOptional({ example: 'Tidak ada' })
  @IsString()
  @IsOptional()
  concerningEnvironmentNotes?: string;

  @ApiPropertyOptional({ example: 'Alergi amoxicillin' })
  @IsString()
  @IsOptional()
  allergyInfo?: string;

  @ApiPropertyOptional({ example: 'Ingin konsultasi persalinan normal' })
  @IsString()
  @IsOptional()
  otherNotes?: string;

  @ApiPropertyOptional({
    example: { hasHypertensionHistory: 'Tidak', hasAsthmaHistory: 'Tidak' },
  })
  @IsObject()
  @IsOptional()
  diseaseHistory?: Record<string, any>;

  @ApiPropertyOptional({ type: [PreviousPregnancyItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviousPregnancyItemDto)
  @IsOptional()
  previousPregnancies?: PreviousPregnancyItemDto[];

  @ApiPropertyOptional({ type: [ContraceptiveHistoryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContraceptiveHistoryItemDto)
  @IsOptional()
  contraceptiveHistories?: ContraceptiveHistoryItemDto[];

  @ApiPropertyOptional({ type: HusbandProfileDto })
  @ValidateNested()
  @Type(() => HusbandProfileDto)
  @IsOptional()
  husband?: HusbandProfileDto;

  @ApiPropertyOptional({ type: [AnamnesisResponseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnamnesisResponseDto)
  @IsOptional()
  anamnesisResponses?: AnamnesisResponseDto[];

  @ApiPropertyOptional({ type: [HealthConditionResponseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthConditionResponseDto)
  @IsOptional()
  healthConditions?: HealthConditionResponseDto[];
}
