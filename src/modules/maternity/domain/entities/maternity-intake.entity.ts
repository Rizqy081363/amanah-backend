import { MaternalConditionResponseEntity } from './maternal-condition-response.entity';
import { MaternalContraceptiveHistoryEntity } from './maternal-contraceptive-history.entity';
import { MaternalHusbandProfileEntity } from './maternal-husband-profile.entity';
import { MaternalPreviousPregnancyEntity } from './maternal-previous-pregnancy.entity';

export class MaternityIntakeEntity {
  id!: string;
  patientId!: string;
  appointmentId?: string | null;
  motherNik!: string;
  motherName!: string;
  motherBirthDate?: string | null;
  motherAge?: number | null;
  marriageOrder?: number | null;
  marriageDate?: string | null;
  motherJob?: string | null;
  motherEducation?: string | null;
  religion?: string | null;
  phoneNumber?: string | null;
  domicileAddress?: string | null;
  identityCardAddress?: string | null;
  dasawisma?: string | null;
  posyandu?: string | null;
  puskesmas?: string | null;

  // Husband / Partner Info
  partnerName?: string | null;
  partnerNik?: string | null;
  partnerBirthDate?: string | null;
  partnerAge?: number | null;
  partnerJob?: string | null;
  partnerEducation?: string | null;
  partnerBloodType?: string | null;

  // Physical & Clinical Baseline
  heightCm?: string | number | null;
  prePregnancyWeightKg?: string | number | null;
  upperArmCircumferenceCm?: string | number | null;
  initialBmi?: string | number | null;
  tetanusStatus?: string | null;
  motherBloodType?: string | null;

  // Obstetric Details
  hpht?: string | null;
  estimatedDueDate?: string | null;
  gestationalAgeWeeks?: string | number | null;
  gestationalAgeFormatted?: string | null;
  currentComplaints?: string | null;
  gravidaCount!: number;
  parityCount!: number;
  abortionCount!: number;
  livingChildrenCount!: number;

  hasPreviousPregnancyHistory!: boolean;
  hasContraceptionHistory!: boolean;

  // Behavioral & Environmental Factors
  smokedBeforePregnancy?: string | null;
  alcoholBeforePregnancy?: boolean | null;
  irregularDietBeforePregnancy?: boolean | null;
  reducedPhysicalActivityBeforePregnancy?: boolean | null;
  unprescribedMedicationBeforePregnancy?: boolean | null;
  concerningCosmeticUseBeforePregnancy?: boolean | null;
  pesticideExposureBeforePregnancy?: boolean | null;
  chemicalExposureBeforePregnancy?: boolean | null;
  smokeExposureBeforePregnancy?: boolean | null;
  concerningEnvironmentNotes?: string | null;
  allergyInfo?: string | null;
  otherNotes?: string | null;

  createdAt!: string;
  updatedAt!: string;

  // Relational aggregates
  husbandProfile?: MaternalHusbandProfileEntity | null;
  previousPregnancies: MaternalPreviousPregnancyEntity[] = [];
  contraceptiveHistories: MaternalContraceptiveHistoryEntity[] = [];
  conditionResponses: MaternalConditionResponseEntity[] = [];

  constructor(partial: Partial<MaternityIntakeEntity>) {
    Object.assign(this, partial);
  }
}
