import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScheduleFormBootstrapDoctor {
  @ApiProperty({ example: '3cb62e10-450b-43e5-aba9-49ec37079ebb' })
  id: string;

  @ApiProperty({ example: 'dr. Fadhiilah Ahmad Zikri, Sp.A' })
  name: string;

  @ApiPropertyOptional({ example: 'b77d141b-2fa5-4481-9f47-a5a040faf57a', nullable: true })
  defaultRoomId: string | null;

  @ApiPropertyOptional({ example: 'Ruang Poli Umum 1', nullable: true })
  defaultRoomName: string | null;

  @ApiPropertyOptional({ example: 'a11d141b-1fa5-4481-9f47-a5a040faf11a', nullable: true })
  defaultPoliklinikId: string | null;

  @ApiPropertyOptional({ example: 'Poli Umum', nullable: true })
  defaultPoliklinikName: string | null;

  @ApiProperty({ example: 30 })
  consultationDurationMinutes: number;
}

export class ScheduleFormBootstrapRoom {
  @ApiProperty({ example: 'b77d141b-2fa5-4481-9f47-a5a040faf57a' })
  id: string;

  @ApiProperty({ example: 'Ruang Poli Umum 1' })
  name: string;

  @ApiProperty({ example: 'RPU-01' })
  code: string;

  @ApiProperty({ example: true })
  isOccupied: boolean;

  @ApiPropertyOptional({ example: 'dr. Ahmad Santoso', nullable: true })
  occupiedBy: string | null;
}

export class ScheduleFormBootstrapPoliklinik {
  @ApiProperty({ example: 'a11d141b-1fa5-4481-9f47-a5a040faf11a' })
  id: string;

  @ApiProperty({ example: 'Poli Umum' })
  name: string;

  @ApiProperty({ example: 'POLI-UMUM' })
  code: string;
}

export class ScheduleFormBootstrapShift {
  @ApiProperty({ example: 'malam' })
  id: string;

  @ApiProperty({ example: 'night' })
  code: string;

  @ApiProperty({ example: 'Sesi Malam' })
  name: string;

  @ApiProperty({ example: '18:00' })
  startTime: string;

  @ApiProperty({ example: '24:00' })
  endTime: string;

  @ApiProperty({ example: false })
  isPast: boolean;

  @ApiPropertyOptional({ nullable: true })
  existingSchedule: any | null;
}

export class ScheduleFormBootstrapData {
  @ApiProperty({ type: () => ScheduleFormBootstrapDoctor })
  doctor: ScheduleFormBootstrapDoctor;

  @ApiProperty({ type: () => [ScheduleFormBootstrapRoom] })
  rooms: ScheduleFormBootstrapRoom[];

  @ApiProperty({ type: () => [ScheduleFormBootstrapPoliklinik] })
  polikliniks: ScheduleFormBootstrapPoliklinik[];

  @ApiProperty({ type: () => [ScheduleFormBootstrapShift] })
  shifts: ScheduleFormBootstrapShift[];
}

export class ScheduleSlotAvailabilityConflict {
  @ApiProperty({ example: 'ROOM_OCCUPIED', enum: ['TEMPORAL_PAST', 'ROOM_OCCUPIED', 'PRACTITIONER_OVERLAP', 'LEAVE'] })
  type: 'TEMPORAL_PAST' | 'ROOM_OCCUPIED' | 'PRACTITIONER_OVERLAP' | 'LEAVE';

  @ApiPropertyOptional({ example: 'dr. Ahmad Santoso', nullable: true })
  occupantName: string | null;

  @ApiProperty({ example: 'Ruang Poli Umum 1 sudah dialokasikan untuk dr. Ahmad Santoso pada jam 18:00 - 24:00 WIB.' })
  reason: string;
}

export class ScheduleSlotAvailabilityItem {
  @ApiProperty({ example: 0 })
  slotIndex: number;

  @ApiProperty({ example: '18:00' })
  time: string;

  @ApiProperty({ example: '18:30' })
  endTime: string;

  @ApiProperty({ example: false })
  isAvailable: boolean;

  @ApiProperty({
    example: 'AVAILABLE',
    enum: ['AVAILABLE', 'PAST', 'OCCUPIED_BY_OTHER', 'OCCUPIED_BY_SELF', 'CLOSED_LEAVE'],
  })
  status: 'AVAILABLE' | 'PAST' | 'OCCUPIED_BY_OTHER' | 'OCCUPIED_BY_SELF' | 'CLOSED_LEAVE';

  @ApiProperty({ example: 'Tersedia' })
  displayLabel: string;

  @ApiPropertyOptional({ type: () => ScheduleSlotAvailabilityConflict, nullable: true })
  conflict: ScheduleSlotAvailabilityConflict | null;
}

export class ScheduleSlotAvailabilitySummary {
  @ApiProperty({ example: 12 })
  totalSlots: number;

  @ApiProperty({ example: 0 })
  availableSlots: number;

  @ApiProperty({ example: 12 })
  occupiedSlots: number;
}

export class ScheduleSlotAvailabilityBoundary {
  @ApiProperty({ example: '18:00' })
  startTime: string;

  @ApiProperty({ example: '24:00' })
  endTime: string;
}

export class ScheduleSlotAvailabilityData {
  @ApiProperty({ example: '2026-09-25' })
  date: string;

  @ApiProperty({ example: 'night' })
  shift: string;

  @ApiProperty({ example: 'Sesi Malam' })
  shiftLabel: string;

  @ApiProperty({ example: 'b77d141b-2fa5-4481-9f47-a5a040faf57a' })
  roomId: string;

  @ApiProperty({ example: 'Ruang Poli Umum 1' })
  roomName: string;

  @ApiProperty({ type: () => ScheduleSlotAvailabilityBoundary })
  boundary: ScheduleSlotAvailabilityBoundary;

  @ApiProperty({ example: 30 })
  intervalMinutes: number;

  @ApiProperty({ type: () => ScheduleSlotAvailabilitySummary })
  summary: ScheduleSlotAvailabilitySummary;

  @ApiProperty({ type: () => [ScheduleSlotAvailabilityItem] })
  slots: ScheduleSlotAvailabilityItem[];
}
