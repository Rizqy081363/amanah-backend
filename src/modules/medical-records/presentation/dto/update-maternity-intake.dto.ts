import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import {
  AnamnesisResponseDto,
  HealthConditionResponseDto,
  HusbandProfileDto,
} from './maternal-normalized-intake.dto';
import {
  ContraceptiveHistoryItemDto,
  PreviousPregnancyItemDto,
} from './create-maternity-intake.dto';

export class UpdateMaternityIntakeDto {
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

  @ApiPropertyOptional({ example: '2024-01-10' })
  @IsDateString()
  @IsOptional()
  hpht?: string;

  @ApiPropertyOptional({ example: '2024-10-17' })
  @IsDateString()
  @IsOptional()
  estimatedDueDate?: string;

  @ApiPropertyOptional({ example: 12.5 })
  @IsNumber()
  @IsOptional()
  gestationalAgeWeeks?: number;

  @ApiPropertyOptional({ example: '12 minggu 3 hari' })
  @IsString()
  @IsOptional()
  gestationalAgeFormatted?: string;

  @ApiPropertyOptional({ example: 'Mual ringan' })
  @IsString()
  @IsOptional()
  currentComplaints?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @IsOptional()
  gravidaCount?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  parityCount?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsInt()
  @IsOptional()
  abortionCount?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  livingChildrenCount?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  hasPreviousPregnancyHistory?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  hasContraceptionHistory?: boolean;

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

  @ApiPropertyOptional({ example: 'Tinggal di kawasan bebas asap' })
  @IsString()
  @IsOptional()
  concerningEnvironmentNotes?: string;

  @ApiPropertyOptional({ example: 'Alergi dingin' })
  @IsString()
  @IsOptional()
  allergyInfo?: string;

  @ApiPropertyOptional({ example: 'Pasien kontrol rutin' })
  @IsString()
  @IsOptional()
  otherNotes?: string;

  @ApiPropertyOptional({ type: HusbandProfileDto })
  @IsObject()
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

  @ApiPropertyOptional({ type: [AnamnesisResponseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnamnesisResponseDto)
  @IsOptional()
  anamnesisResponses?: AnamnesisResponseDto[];

  @ApiPropertyOptional({ example: { motherName: 'Siti' } })
  @IsObject()
  @IsOptional()
  answers?: Record<string, any>;
}
