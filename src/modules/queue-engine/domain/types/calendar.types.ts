export interface TimeInterval {
  start: Date;
  end: Date;
}

export interface ScheduledShift {
  id: string;
  sessionId: string;
  sessionCode?: string;
  dow: number; // 0 = Sunday .. 6 = Saturday
  startsAt: string; // HH:mm:ss or HH:mm
  endsAt: string; // HH:mm:ss or HH:mm
  isActive: boolean;
}

export interface ClosureInterval {
  id: string;
  scope: 'clinic' | 'category' | 'doctor' | 'room';
  categoryId?: string | null;
  doctorId?: string | null;
  roomId?: string | null;
  startsAt: Date;
  endsAt: Date;
  inputKind: 'day' | 'session' | 'range';
  lastCallBufferMin?: number;
  reason?: string | null;
  cancelledAt?: Date | null;
}

export interface ExtraOpeningInterval {
  id: string;
  categoryId?: string | null;
  startsAt: Date;
  endsAt: Date;
  note?: string | null;
}
