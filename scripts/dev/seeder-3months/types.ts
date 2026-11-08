import type { Pool } from 'pg';
import type Redis from 'ioredis';

export interface MasterRole {
  id: string;
  code: string;
  name: string;
  audience: string;
}

export interface MasterClinicService {
  id: string;
  code: string;
  name: string;
  code_prefix: string;
  service_category_id: string | null;
}

export interface MasterClinicRoom {
  id: string;
  code: string;
  name: string;
  unit_id: string | null;
}

export interface MasterSessionDef {
  id: string;
  code: string;
  code_prefix: string;
  label: string;
  default_starts_at: string;
  default_ends_at: string;
}

export interface MasterRelationshipType {
  id: string;
  code: string;
  name: string;
}

export interface MasterBloodType {
  id: string;
  code: string;
}

export interface MasterMedicalSpecialty {
  id: string;
  code: string;
  name: string;
}

export interface MasterClinicUnit {
  id: string;
  code: string;
  name: string;
}

export interface MasterServiceCategory {
  id: string;
  code: string;
  name: string;
}

export interface DbContext {
  pool: Pool;
  redis: Redis | null;
  roles: Map<string, MasterRole>;
  services: Map<string, MasterClinicService>;
  rooms: Map<string, MasterClinicRoom>;
  sessions: Map<string, MasterSessionDef>;
  relationshipTypes: Map<string, MasterRelationshipType>;
  bloodTypes: Map<string, MasterBloodType>;
  specialties: Map<string, MasterMedicalSpecialty>;
  units: Map<string, MasterClinicUnit>;
  serviceCategories: Map<string, MasterServiceCategory>;
}

export interface CreatedStaff {
  userId: string;
  staffProfileId: string;
  practitionerId?: string;
  roleCode: string;
  fullName: string;
  email: string;
  staffCode: string;
  department: string;
  position: string;
  defaultRoomId?: string;
  specialtyId?: string;
}

export interface CreatedPatient {
  userId: string;
  patientProfileId: string;
  mrn: string;
  fullName: string;
  email: string;
  gender: 'male' | 'female';
  birthDate: string;
  relationshipCode: string; // 'self' | 'spouse' | 'child' | 'parent'
  familyHeadUserId: string;
}

export interface TimelineDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  isWorkday: boolean;
  dayIndex: number; // 0 to TotalDays - 1
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface SeedProgressReporter {
  startStage: (title: string) => void;
  endStage: (detail?: string) => void;
  info: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string, err?: unknown) => void;
}
