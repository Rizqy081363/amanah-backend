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
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ContraceptiveHistoryItemDto,
  HealthConditionResponseDto,
  HusbandProfileDto,
  PreviousPregnancyItemDto,
} from './maternity-components.dto';

export class CreateMaternityIntakeDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @ApiPropertyOptional({ example: 'Siti Aminah' })
  @IsString()
  @MaxLength(255)
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
  @Min(0)
  @Max(150)
  @IsOptional()
  motherAge?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  marriageOrder?: number;

  @ApiPropertyOptional({ example: '2020-08-15' })
  @IsDateString()
  @IsOptional()
  marriageDate?: string;

  @ApiPropertyOptional({ example: 'ibu_rumah_tangga' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  motherJob?: string;

  @ApiPropertyOptional({ example: 's1' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  motherEducation?: string;

  @ApiPropertyOptional({ example: 'islam' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  religion?: string;

  @ApiPropertyOptional({ example: '081234567890' })
  @IsString()
  @MaxLength(32)
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
  @MaxLength(100)
  @IsOptional()
  dasawisma?: string;

  @ApiPropertyOptional({ example: 'Posyandu Mawar' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  posyandu?: string;

  @ApiPropertyOptional({ example: 'Puskesmas Depok II' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  puskesmas?: string;

  // Husband / Partner Info
  @ApiPropertyOptional({ example: 'Ahmad Fauzi' })
  @IsString()
  @MaxLength(255)
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
  @Min(0)
  @Max(150)
  @IsOptional()
  partnerAge?: number;

  @ApiPropertyOptional({ example: 'karyawan_swasta' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  partnerJob?: string;

  @ApiPropertyOptional({ example: 's1' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  partnerEducation?: string;

  @ApiPropertyOptional({ example: 'B' })
  @IsString()
  @MaxLength(10)
  @IsOptional()
  partnerBloodType?: string;

  // Physical Baseline
  @ApiPropertyOptional({ example: 158 })
  @IsNumber()
  @Min(0)
  @Max(300)
  @IsOptional()
  heightCm?: number;

  @ApiPropertyOptional({ example: 52 })
  @IsNumber()
  @Min(0)
  @Max(500)
  @IsOptional()
  prePregnancyWeightKg?: number;

  @ApiPropertyOptional({ example: 24.5 })
  @IsNumber()
  @Min(0)
  @Max(150)
  @IsOptional()
  upperArmCircumferenceCm?: number;

  @ApiPropertyOptional({ example: 20.8 })
  @IsNumber()
  @Min(0)
  @Max(150)
  @IsOptional()
  initialBmi?: number;

  @ApiPropertyOptional({ example: 'T2' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  tetanusStatus?: string;

  @ApiPropertyOptional({ example: 'O' })
  @IsString()
  @MaxLength(10)
  @IsOptional()
  motherBloodType?: string;

  // Obstetric Details
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
  @Min(0)
  @Max(60)
  @IsOptional()
  gestationalAgeWeeks?: number;

  @ApiPropertyOptional({ example: '10 minggu 3 hari' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  gestationalAgeFormatted?: string;

  @ApiProperty({
    example: 'Mual muntah di pagi hari',
  })
  @IsString()
  @IsNotEmpty()
  currentComplaints!: string;

  @ApiProperty({ example: 2, default: 1 })
  @IsInt()
  @Min(1)
  @Max(50)
  gravidaCount!: number;

  @ApiProperty({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  @Max(50)
  parityCount!: number;

  @ApiProperty({ example: 0, default: 0 })
  @IsInt()
  @Min(0)
  @Max(50)
  abortionCount!: number;

  @ApiProperty({ example: 1, default: 0 })
  @IsInt()
  @Min(0)
  @Max(50)
  livingChildrenCount!: number;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  hasPreviousPregnancyHistory?: boolean;

  @ApiPropertyOptional({ example: true, default: false })
  @IsBoolean()
  @IsOptional()
  hasContraceptionHistory?: boolean;

  // Behavioral & Environment
  @ApiPropertyOptional({ example: 'Tidak' })
  @IsIn(['Aktif', 'Pasif', 'Tidak'])
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

  @ApiPropertyOptional({ example: 'Konsultasi persalinan' })
  @IsString()
  @IsOptional()
  otherNotes?: string;

  // Normalized Relations
  @ApiPropertyOptional({ type: HusbandProfileDto })
  @ValidateNested()
  @Type(() => HusbandProfileDto)
  @IsOptional()
  husband?: HusbandProfileDto;

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

  @ApiPropertyOptional({ type: [HealthConditionResponseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HealthConditionResponseDto)
  @IsOptional()
  healthConditions?: HealthConditionResponseDto[];
}
