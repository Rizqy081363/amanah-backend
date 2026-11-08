export interface PersistHusbandCommand {
  fullName: string;
  nik?: string | null;
  birthDate?: string | null;
  age?: number | null;
  job?: string | null;
  education?: string | null;
  bloodType?: string | null;
  phoneNumber?: string | null;
}

export interface PersistPreviousPregnancyCommand {
  orderNumber: number;
  birthYear?: string | null;
  birthWeightGrams?: number | null;
  birthLengthCm?: number | string | null;
  childSex?: string | null;
  gestationalAgeAtBirth?: string | null;
  birthAttendant?: string | null;
  deliveryMethod?: string | null;
  deliveryPlace?: string | null;
  complications?: string | null;
}

export interface PersistContraceptiveHistoryCommand {
  orderNumber: number;
  startDate?: string | null;
  contraceptiveType?: string | null;
  durationText?: string | null;
  stopDate?: string | null;
  problems?: string | null;
  sideEffects?: string | null;
}

export interface PersistHealthConditionCommand {
  conditionCode: string;
  hasCondition: boolean;
  diagnosisYear?: number | null;
  notes?: string | null;
}

export interface PersistMaternityIntakeCommand {
  patientId: string;
  appointmentId?: string | null;
  motherName: string;
  motherNik?: string | null;
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
  partnerName?: string | null;
  partnerNik?: string | null;
  partnerBirthDate?: string | null;
  partnerAge?: number | null;
  partnerJob?: string | null;
  partnerEducation?: string | null;
  partnerBloodType?: string | null;
  heightCm?: number | string | null;
  prePregnancyWeightKg?: number | string | null;
  upperArmCircumferenceCm?: number | string | null;
  initialBmi?: number | string | null;
  tetanusStatus?: string | null;
  motherBloodType?: string | null;
  hpht?: string | null;
  estimatedDueDate?: string | null;
  gestationalAgeWeeks?: number | string | null;
  gestationalAgeFormatted?: string | null;
  currentComplaints?: string | null;
  gravidaCount: number;
  parityCount: number;
  abortionCount: number;
  livingChildrenCount: number;
  hasPreviousPregnancyHistory: boolean;
  hasContraceptionHistory: boolean;
  smokedBeforePregnancy?: string | null;
  alcoholBeforePregnancy: boolean;
  irregularDietBeforePregnancy: boolean;
  reducedPhysicalActivityBeforePregnancy: boolean;
  unprescribedMedicationBeforePregnancy: boolean;
  concerningCosmeticUseBeforePregnancy: boolean;
  pesticideExposureBeforePregnancy: boolean;
  chemicalExposureBeforePregnancy: boolean;
  smokeExposureBeforePregnancy: boolean;
  concerningEnvironmentNotes?: string | null;
  allergyInfo?: string | null;
  otherNotes?: string | null;
  husband?: PersistHusbandCommand | null;
  previousPregnancies?: PersistPreviousPregnancyCommand[];
  contraceptiveHistories?: PersistContraceptiveHistoryCommand[];
  healthConditions?: PersistHealthConditionCommand[];
  submittedByUserId?: string | null;
  patientIdentitySync?: {
    nationalIdEncrypted: string | null;
    nationalIdHash: string | null;
  } | null;
  appointmentComplaintSync?: {
    appointmentId: string;
    complaint: string | null;
  } | null;
}

export type PersistMaternityIntakePatch = Partial<
  Omit<PersistMaternityIntakeCommand, 'patientId'>
>;
