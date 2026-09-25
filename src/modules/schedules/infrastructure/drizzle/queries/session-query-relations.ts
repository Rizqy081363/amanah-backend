export const SESSION_RECORD_RELATIONS = {
  practitioner: {
    with: {
      staffProfile: {
        with: {
          clinicUnit: true,
          user: true,
        },
      },
    },
  },
  clinicRoom: {
    with: {
      clinicUnit: true,
    },
  },
  clinicService: true,
} as const;

export type SessionShiftType = 'morning' | 'afternoon' | 'night';

export function resolveSessionShift(input: {
  session?: string | null;
  sessionShift?: string | null;
}): {
  shift: SessionShiftType;
  defaultLabel: string;
} {
  const isAfternoon =
    input.session === 'SIANG' || input.sessionShift === 'afternoon';
  const isNight = input.session === 'MALAM' || input.sessionShift === 'night';

  if (isAfternoon) {
    return { shift: 'afternoon', defaultLabel: 'Siang' };
  }
  if (isNight) {
    return { shift: 'night', defaultLabel: 'Malam' };
  }
  return { shift: 'morning', defaultLabel: 'Pagi' };
}

export function resolveDefaultSessionTimes(shift: SessionShiftType): {
  startTime: string;
  endTime: string;
} {
  if (shift === 'afternoon') {
    return { startTime: '13:00', endTime: '17:00' };
  }
  if (shift === 'night') {
    return { startTime: '18:00', endTime: '21:00' };
  }
  return { startTime: '07:00', endTime: '11:00' };
}
