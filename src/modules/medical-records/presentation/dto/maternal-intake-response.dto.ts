import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ContraceptiveHistoryItemDto,
  PreviousPregnancyItemDto,
} from './create-maternity-intake.dto';

export class MaternalIntakeResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  intakeSubmissionId: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002' })
  patientId: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440003' })
  appointmentId?: string | null;

  @ApiProperty({ example: '3201234567890001' })
  motherNik: string;

  @ApiProperty({ example: 'Siti Aminah' })
  motherName: string;

  @ApiPropertyOptional({ example: '1995-04-12' })
  motherBirthDate?: string | null;

  @ApiPropertyOptional({ example: 29 })
  motherAge?: number | null;

  @ApiPropertyOptional({ example: 1 })
  marriageOrder?: number | null;

  @ApiPropertyOptional({ example: '2020-08-15' })
  marriageDate?: string | null;

  @ApiPropertyOptional({ example: 'Ibu Rumah Tangga' })
  motherJob?: string | null;

  @ApiPropertyOptional({ example: 'S1' })
  motherEducation?: string | null;

  @ApiPropertyOptional({ example: 'Islam' })
  religion?: string | null;

  @ApiPropertyOptional({ example: '081234567890' })
  phoneNumber?: string | null;

  @ApiPropertyOptional({ example: 'Jl. Anyelir 1 No. 243, Condongcatur' })
  domicileAddress?: string | null;

  @ApiPropertyOptional({ example: 'Jl. Anyelir 1 No. 243, Condongcatur' })
  identityCardAddress?: string | null;

  @ApiPropertyOptional({ example: 'Melati 3' })
  dasawisma?: string | null;

  @ApiPropertyOptional({ example: 'Posyandu Mawar' })
  posyandu?: string | null;

  @ApiPropertyOptional({ example: 'Puskesmas Depok II' })
  puskesmas?: string | null;

  @ApiPropertyOptional({ example: 'Ahmad Fauzi' })
  partnerName?: string | null;

  @ApiPropertyOptional({ example: '3201234567890002' })
  partnerNik?: string | null;

  @ApiPropertyOptional({ example: '1993-02-18' })
  partnerBirthDate?: string | null;

  @ApiPropertyOptional({ example: 31 })
  partnerAge?: number | null;

  @ApiPropertyOptional({ example: 'Karyawan Swasta' })
  partnerJob?: string | null;

  @ApiPropertyOptional({ example: 'S1' })
  partnerEducation?: string | null;

  @ApiPropertyOptional({ example: 'B' })
  partnerBloodType?: string | null;

  @ApiPropertyOptional({ example: '158.00' })
  heightCm?: string | number | null;

  @ApiPropertyOptional({ example: '52.00' })
  prePregnancyWeightKg?: string | number | null;

  @ApiPropertyOptional({ example: '24.5' })
  upperArmCircumferenceCm?: string | number | null;

  @ApiPropertyOptional({ example: '20.8' })
  initialBmi?: string | number | null;

  @ApiPropertyOptional({ example: 'T2' })
  tetanusStatus?: string | null;

  @ApiPropertyOptional({ example: 'O' })
  motherBloodType?: string | null;

  @ApiPropertyOptional({ example: '2026-01-10' })
  hpht?: string | null;

  @ApiPropertyOptional({ example: '2026-10-17' })
  estimatedDueDate?: string | null;

  @ApiPropertyOptional({ example: '10.5' })
  gestationalAgeWeeks?: string | number | null;

  @ApiPropertyOptional({ example: '10 minggu 3 hari' })
  gestationalAgeFormatted?: string | null;

  @ApiPropertyOptional({ example: 'Mual muntah di pagi hari' })
  currentComplaints?: string | null;

  @ApiProperty({ example: 2 })
  gravidaCount: number;

  @ApiProperty({ example: 1 })
  parityCount: number;

  @ApiProperty({ example: 0 })
  abortionCount: number;

  @ApiProperty({ example: 1 })
  livingChildrenCount: number;

  @ApiProperty({ example: true })
  hasPreviousPregnancyHistory: boolean;

  @ApiProperty({ example: true })
  hasContraceptionHistory: boolean;

  @ApiPropertyOptional({ example: 'Tidak' })
  smokedBeforePregnancy?: string | null;

  @ApiPropertyOptional({ example: false })
  alcoholBeforePregnancy?: boolean | null;

  @ApiPropertyOptional({ example: false })
  irregularDietBeforePregnancy?: boolean | null;

  @ApiPropertyOptional({ example: false })
  reducedPhysicalActivityBeforePregnancy?: boolean | null;

  @ApiPropertyOptional({ example: false })
  unprescribedMedicationBeforePregnancy?: boolean | null;

  @ApiPropertyOptional({ example: false })
  concerningCosmeticUseBeforePregnancy?: boolean | null;

  @ApiPropertyOptional({ example: false })
  pesticideExposureBeforePregnancy?: boolean | null;

  @ApiPropertyOptional({ example: false })
  chemicalExposureBeforePregnancy?: boolean | null;

  @ApiPropertyOptional({ example: false })
  smokeExposureBeforePregnancy?: boolean | null;

  @ApiPropertyOptional({ example: 'Tidak ada' })
  concerningEnvironmentNotes?: string | null;

  @ApiPropertyOptional({ example: 'Alergi amoxicillin' })
  allergyInfo?: string | null;

  @ApiPropertyOptional({ example: 'Konsultasi persalinan normal' })
  otherNotes?: string | null;

  @ApiPropertyOptional()
  diseaseHistory?: Record<string, any>;

  @ApiPropertyOptional({ type: [PreviousPregnancyItemDto] })
  previousPregnancies?: PreviousPregnancyItemDto[];

  @ApiPropertyOptional({ type: [ContraceptiveHistoryItemDto] })
  contraceptiveHistories?: ContraceptiveHistoryItemDto[];

  @ApiPropertyOptional()
  answers?: Record<string, any>;

  @ApiPropertyOptional()
  automatic?: Record<string, any>;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-10-01T10:00:00.000Z' })
  updatedAt: string;
}
