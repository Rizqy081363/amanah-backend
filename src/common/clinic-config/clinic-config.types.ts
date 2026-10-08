export interface ScopeQuery {
  doctorId?: string;
  categoryId?: string;
}

export interface ClinicSchedulePolicyData {
  id: string;
  code: string;
  defaultConsultationDurationMinutes: number;
  defaultStartPrecisionMinutes: number;
  earlyMorningStart: string;
  earlyMorningEnd: string;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  nightStart: string;
  nightEnd: string;
  checkInWindowHours: number;
}

export interface ClinicProfileData {
  id: string;
  name: string;
  shortName: string | null;
  legalName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  region: string | null;
  emergencyNotice: string | null;
}

export interface DurationPriorsData {
  priorMinutes: number;
  priorWeight: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface EtaConfigData {
  displayRoundMinutes: number;
  notifyDelayMinutes: number;
  spreadZ: number;
  updateThresholdMinutes: number;
}

export interface QueueThresholdsData {
  arriveEarlyMinutes: number;
  overflowToleranceMinutes: number;
  noShowGraceMinutes: number;
  noShowCallAttempts: number;
  maxActivePerPatientCategoryDay: number;
  rescheduleWarnWhenAheadLte: number;
  showDoctorWhenCalled: boolean;
}
