import {
  BookedPatientEntity,
  CalendarSummaryResponse,
  ClinicRoomReferenceEntity,
  DayScheduleSettingEntity,
  ScheduleEntity,
} from '../entities/schedule.entity';

export const SCHEDULE_REPOSITORY = 'SCHEDULE_REPOSITORY';

export interface ScheduleRepository {
  create(
    data: Omit<ScheduleEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ScheduleEntity>;
  findById(id: string): Promise<ScheduleEntity | null>;
  findAll(
    limit?: number,
    offset?: number,
    filters?: {
      poliklinikId?: string;
      staffId?: string;
      date?: string;
    },
  ): Promise<ScheduleEntity[]>;
  findByStaffId(staffId: string): Promise<ScheduleEntity[]>;
  findMySchedules(
    staffId: string,
    filters?: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<ScheduleEntity[]>;
  findByPoliAndDate(poliklinikId: string, date: string): Promise<any[]>;
  update(
    id: string,
    data: Partial<ScheduleEntity>,
  ): Promise<ScheduleEntity | null>;
  toggleAvailability(
    id: string,
    isAvailable: boolean,
  ): Promise<ScheduleEntity | null>;
  delete(id: string): Promise<boolean>;

  // Doctor Schedule Management ("Jadwal Dokter") methods
  getCalendarSummary(
    staffId: string,
    month: string,
  ): Promise<CalendarSummaryResponse>;
  getDaySettings(
    staffId: string,
    date: string,
  ): Promise<DayScheduleSettingEntity>;
  upsertDaySettings(
    staffId: string,
    date: string,
    data: {
      targetQuota?: number;
      isCuti?: boolean;
      cutiReason?: string | null;
      userId?: string;
    },
  ): Promise<DayScheduleSettingEntity>;
  getBookedPatients(
    sessionId?: string,
    date?: string,
    staffId?: string,
  ): Promise<BookedPatientEntity[]>;
  getRooms(
    date?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<ClinicRoomReferenceEntity[]>;
  getPolikliniks(): Promise<
    { id: string; code: string; name: string; location?: string | null }[]
  >;
}
