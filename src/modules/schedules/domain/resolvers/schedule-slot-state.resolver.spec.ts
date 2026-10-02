import {
  AVAILABILITY_STATE,
  CLOSURE_CATEGORY,
  EFFECTIVE_SLOT_STATUS,
  ScheduleSlotStateResolver,
  SHIFT_OPERATIONAL_STATUS,
  SLOT_ACTION_TYPE,
  SLOT_UI_STATUS,
  SLOT_UI_VARIANT,
  SlotStateResolverInput,
  TEMPORAL_STATE,
} from './schedule-slot-state.resolver';

describe('ScheduleSlotStateResolver', () => {
  const BASE_DATE = '2026-09-24';
  const CURRENT_TIME = '10:00'; // 600 minutes into day (morning context: 06:00 - 12:00)

  describe('Multi-dimensional State Resolution', () => {
    it('should resolve slots as UNSCHEDULED by default when no opened practitioner range covers them', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning', // 06:00 - 12:00 -> 12 slots @ 30m
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '05:00', // All future
        openedRanges: [],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      expect(result.contextId).toBe('morning');
      expect(result.slots).toHaveLength(12);
      expect(result.counts.total).toBe(12);
      expect(result.counts.unscheduled).toBe(12);
      expect(result.counts.available).toBe(0);
      expect(result.counts.occupied).toBe(0);
      expect(result.counts.closed).toBe(0);

      // Verify exact sum invariant: total = unscheduled + available + occupied + closed
      expect(result.counts.total).toBe(
        result.counts.unscheduled +
          result.counts.available +
          result.counts.occupied +
          result.counts.closed,
      );

      const firstSlot = result.slots[0];
      expect(firstSlot.startTime).toBe('06:00');
      expect(firstSlot.endTime).toBe('06:30');
      expect(firstSlot.availabilityState).toBe(AVAILABILITY_STATE.UNSCHEDULED);
      expect(firstSlot.effectiveStatus).toBe(EFFECTIVE_SLOT_STATUS.UNSCHEDULED);
      expect(firstSlot.isSelectable).toBe(false);
    });

    it('should resolve slots as AVAILABLE when practitioner range is open and no bookings exist', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning',
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '05:00', // All future
        openedRanges: [
          {
            id: 'range-1',
            startTime: '08:00',
            endTime: '10:00', // 4 slots: 08:00-08:30, 08:30-09:00, 09:00-09:30, 09:30-10:00
            status: 'open',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      expect(result.counts.total).toBe(12);
      expect(result.counts.available).toBe(4);
      expect(result.counts.unscheduled).toBe(8);
      expect(result.counts.occupied).toBe(0);
      expect(result.counts.closed).toBe(0);

      // 08:00 - 08:30 (slotIndex 5 in 06:00-12:00 morning shift)
      const slot8am = result.slots.find((s) => s.startTime === '08:00');
      expect(slot8am).toBeDefined();
      expect(slot8am?.availabilityState).toBe('AVAILABLE');
      expect(slot8am?.effectiveStatus).toBe('AVAILABLE');
      expect(slot8am?.temporalState).toBe('FUTURE');
      expect(slot8am?.isSelectable).toBe(true);

      // 06:00 - 06:30 should still be unscheduled
      const slot6am = result.slots.find((s) => s.startTime === '06:00');
      expect(slot6am?.availabilityState).toBe('UNSCHEDULED');
      expect(slot6am?.isSelectable).toBe(false);
    });

    it('should resolve slot as OCCUPIED when active appointment is scheduled in open range', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning',
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '05:00',
        openedRanges: [
          {
            id: 'range-1',
            startTime: '08:00',
            endTime: '10:00',
            status: 'open',
          },
        ],
        appointments: [
          {
            id: 'appt-1',
            bookingCode: 'APT-1001',
            patientId: 'pat-1',
            patientName: 'Budi Santoso',
            startTime: '08:30',
            endTime: '09:00',
            status: 'confirmed',
            queueNumber: 'A-01',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      expect(result.counts.available).toBe(3);
      expect(result.counts.occupied).toBe(1);
      expect(result.counts.unscheduled).toBe(8);

      const occupiedSlot = result.slots.find((s) => s.startTime === '08:30');
      expect(occupiedSlot).toBeDefined();
      expect(occupiedSlot?.availabilityState).toBe('OCCUPIED');
      expect(occupiedSlot?.effectiveStatus).toBe('OCCUPIED');
      expect(occupiedSlot?.isSelectable).toBe(false);
      expect(occupiedSlot?.appointment).toEqual({
        id: 'appt-1',
        bookingCode: 'APT-1001',
        patientId: 'pat-1',
        patientName: 'Budi Santoso',
        queueNumber: 'A-01',
        status: 'confirmed',
      });
    });

    it('should resolve slots as CLOSED with LEAVE category when practitioner has active leave', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning',
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '05:00',
        openedRanges: [
          {
            id: 'range-1',
            startTime: '08:00',
            endTime: '12:00',
            status: 'open',
          },
        ],
        leavePeriods: [
          {
            id: 'leave-1',
            startDate: '2026-09-20',
            endDate: '2026-09-25',
            reason: 'Cuti Tahunan',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      // Entire context is closed due to doctor leave
      expect(result.counts.closed).toBe(12);
      expect(result.counts.available).toBe(0);
      expect(result.counts.occupied).toBe(0);
      expect(result.counts.unscheduled).toBe(0);

      const slot = result.slots[0];
      expect(slot.availabilityState).toBe('CLOSED');
      expect(slot.effectiveStatus).toBe('CLOSED');
      expect(slot.isSelectable).toBe(false);
      expect(slot.closure).toEqual({
        category: 'LEAVE',
        reasonCode: 'LEAVE',
        reasonText: 'Cuti Tahunan',
        sourceType: 'leave_period',
        sourceId: 'leave-1',
      });
    });

    it('should resolve slots as CLOSED with OTHER category when manual schedule closure exists', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning',
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '05:00',
        openedRanges: [
          {
            id: 'range-1',
            startTime: '06:00',
            endTime: '12:00',
            status: 'open',
          },
        ],
        closures: [
          {
            id: 'closure-1',
            scheduleDate: BASE_DATE,
            scope: 'INTERVAL',
            startTime: '09:00',
            endTime: '10:00', // 2 slots: 09:00-09:30 and 09:30-10:00
            category: 'OTHER',
            reasonCode: 'MEETING',
            reasonText: 'Rapat Koordinasi Dokter',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      expect(result.counts.closed).toBe(2);
      expect(result.counts.available).toBe(10);
      expect(result.counts.occupied).toBe(0);

      const closedSlot = result.slots.find((s) => s.startTime === '09:00');
      expect(closedSlot?.availabilityState).toBe('CLOSED');
      expect(closedSlot?.effectiveStatus).toBe('CLOSED');
      expect(closedSlot?.closure).toEqual({
        category: 'OTHER',
        reasonCode: 'MEETING',
        reasonText: 'Rapat Koordinasi Dokter',
        sourceType: 'schedule_closure',
        sourceId: 'closure-1',
      });
    });

    it('should correctly derive TemporalState and EXPIRED effectiveStatus without losing underlying availability or appointment', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning', // 06:00 - 12:00
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: CURRENT_TIME, // 10:00 -> slots before 10:00 are PAST, 10:00-10:30 is CURRENT, after is FUTURE
        openedRanges: [
          {
            id: 'range-1',
            startTime: '06:00',
            endTime: '12:00',
            status: 'open',
          },
        ],
        appointments: [
          {
            id: 'past-appt',
            bookingCode: 'APT-0800',
            patientName: 'Pasien Pagi',
            startTime: '08:00',
            endTime: '08:30',
            status: 'completed',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      // Slots 06:00 to 10:00 = 8 slots are PAST (06:00, 06:30, 07:00, 07:30, 08:00, 08:30, 09:00, 09:30)
      // Slot 10:00 to 10:30 = 1 slot is CURRENT
      // Slots 10:30 to 12:00 = 3 slots are FUTURE
      expect(result.counts.past).toBe(8);
      expect(result.counts.current).toBe(1);
      expect(result.counts.future).toBe(3);

      const pastOccupiedSlot = result.slots.find(
        (s) => s.startTime === '08:00',
      );
      expect(pastOccupiedSlot).toBeDefined();
      expect(pastOccupiedSlot?.temporalState).toBe('PAST');
      expect(pastOccupiedSlot?.effectiveStatus).toBe('EXPIRED');
      // Crucial: underlying availabilityState and appointment data MUST NOT be lost!
      expect(pastOccupiedSlot?.availabilityState).toBe('OCCUPIED');
      expect(pastOccupiedSlot?.appointment?.bookingCode).toBe('APT-0800');
      expect(pastOccupiedSlot?.isSelectable).toBe(false);

      const currentSlot = result.slots.find((s) => s.startTime === '10:00');
      expect(currentSlot?.temporalState).toBe('CURRENT');
      expect(currentSlot?.effectiveStatus).toBe('AVAILABLE');
      expect(currentSlot?.isSelectable).toBe(true);

      const futureSlot = result.slots.find((s) => s.startTime === '11:00');
      expect(futureSlot?.temporalState).toBe('FUTURE');
      expect(futureSlot?.effectiveStatus).toBe('AVAILABLE');
      expect(futureSlot?.isSelectable).toBe(true);
    });

    it('should attach Reschedule metadata when a reschedule event overlaps the slot interval', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning',
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '05:00',
        openedRanges: [
          {
            id: 'range-1',
            startTime: '08:00',
            endTime: '12:00',
            status: 'open',
          },
        ],
        rescheduleEvents: [
          {
            id: 're-1',
            sourceDate: '2026-09-23',
            sourceStartTime: '14:00',
            sourceEndTime: '15:00',
            targetDate: BASE_DATE,
            targetStartTime: '09:00',
            targetEndTime: '10:00', // covers 09:00-09:30 and 09:30-10:00
            reasonCode: 'DOCTOR_REQUEST',
            reasonText: 'Dokter berhalangan kemarin siang',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      const rescheduledSlot = result.slots.find((s) => s.startTime === '09:00');
      expect(rescheduledSlot).toBeDefined();
      expect(rescheduledSlot?.reschedule).toBeDefined();
      expect(rescheduledSlot?.reschedule?.isRescheduled).toBe(true);
      expect(rescheduledSlot?.reschedule?.sourceDate).toBe('2026-09-23');
      expect(rescheduledSlot?.reschedule?.sourceStartTime).toBe('14:00');
      expect(rescheduledSlot?.reschedule?.targetDate).toBe(BASE_DATE);
      expect(rescheduledSlot?.reschedule?.targetStartTime).toBe('09:00');
      expect(rescheduledSlot?.reschedule?.reasonCode).toBe('DOCTOR_REQUEST');

      // Slot outside reschedule window does not have reschedule metadata
      const normalSlot = result.slots.find((s) => s.startTime === '08:00');
      expect(normalSlot?.reschedule).toBeUndefined();
    });

    it('should maintain mathematical count invariant across complex mixed states', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning', // 12 slots total
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '09:00',
        openedRanges: [
          {
            id: 'r1',
            startTime: '07:00',
            endTime: '11:00', // 8 slots open (07:00 to 11:00)
            status: 'open',
          },
        ],
        appointments: [
          {
            id: 'a1',
            startTime: '07:30',
            endTime: '08:00',
            status: 'booked',
          },
        ],
        closures: [
          {
            id: 'c1',
            scheduleDate: BASE_DATE,
            scope: 'INTERVAL',
            startTime: '10:00',
            endTime: '10:30', // 1 slot closed
            category: 'OTHER',
            reasonText: 'Maintenance',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      // In 06:00-12:00 (12 slots):
      // 06:00-07:00 (2 slots) -> UNSCHEDULED
      // 11:00-12:00 (2 slots) -> UNSCHEDULED
      // -> Total unscheduled = 4
      // Closed: 10:00-10:30 -> 1 slot CLOSED
      // Occupied: 07:30-08:00 -> 1 slot OCCUPIED
      // Available: remaining in open range (8 - 1 closed - 1 occupied) = 6 slots AVAILABLE
      expect(result.counts.total).toBe(12);
      expect(result.counts.unscheduled).toBe(4);
      expect(result.counts.closed).toBe(1);
      expect(result.counts.occupied).toBe(1);
      expect(result.counts.available).toBe(6);

      // Check sum equality
      expect(result.counts.total).toBe(
        result.counts.unscheduled +
          result.counts.available +
          result.counts.occupied +
          result.counts.closed,
      );
    });

    it('should accurately calculate dual indicators: scheduleCoverage (5/12) and patient occupancy (2/4) for exact user scenario', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning', // 06:00 - 12:00 (12 slots)
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '05:00', // All future
        // Doctor opened 5 slots: 07:00 - 09:30
        openedRanges: [
          {
            id: 'range-exact-user',
            startTime: '07:00',
            endTime: '09:30', // 5 slots: 07:00-07:30, 07:30-08:00, 08:00-08:30, 08:30-09:00, 09:00-09:30
            status: 'open',
          },
        ],
        // 2 active patients: 07:30-08:00 and 08:00-08:30
        appointments: [
          {
            id: 'appt-1',
            startTime: '07:30',
            endTime: '08:00',
            status: 'booked',
          },
          {
            id: 'appt-2',
            startTime: '08:00',
            endTime: '08:30',
            status: 'booked',
          },
        ],
        // 1 closed slot: 09:00-09:30
        closures: [
          {
            id: 'closure-1',
            scheduleDate: BASE_DATE,
            scope: 'INTERVAL',
            startTime: '09:00',
            endTime: '09:30',
            category: 'OTHER',
            reasonCode: 'MEETING',
            reasonText: 'Rapat Koordinasi',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      // 1. Invariant verification
      expect(result.counts.total).toBe(12);
      expect(result.metrics.totalSlots).toBe(12);

      // Scheduled vs Unscheduled
      expect(result.metrics.scheduledSlots).toBe(5);
      expect(result.metrics.unscheduledSlots).toBe(7);
      expect(result.counts.unscheduled).toBe(7);

      // Availability breakdown
      expect(result.metrics.availableSlots).toBe(2);
      expect(result.metrics.occupiedSlots).toBe(2);
      expect(result.metrics.closedSlots).toBe(1);

      // Mathematical Invariant: Total = Unscheduled + Available + Occupied + Closed
      expect(result.metrics.totalSlots).toBe(
        result.metrics.unscheduledSlots +
          result.metrics.availableSlots +
          result.metrics.occupiedSlots +
          result.metrics.closedSlots,
      );

      // Active bookable slots = Available (2) + Occupied (2) = 4 (Closed is not active capacity!)
      expect(result.metrics.activeBookableSlots).toBe(4);

      // Dual Indicator 1: Patient Occupancy (2 / 4 = 50%)
      expect(result.metrics.occupancy.occupied).toBe(2);
      expect(result.metrics.occupancy.capacity).toBe(4);
      expect(result.metrics.occupancy.percentage).toBe(50);

      // Dual Indicator 2: Doctor Schedule Coverage (5 / 12 = 41.67%)
      expect(result.metrics.scheduleCoverage.scheduled).toBe(5);
      expect(result.metrics.scheduleCoverage.total).toBe(12);
      expect(result.metrics.scheduleCoverage.percentage).toBe(41.67);
    });

    it('should NOT mark past UNSCHEDULED slots as EXPIRED and should supply UI-ready Plug & Play attributes', () => {
      // Simulate Dini Hari (00:00 - 06:00), currently 17:15 (all past)
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'early_morning', // 00:00 - 06:00
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '17:15', // Past time
        openedRanges: [], // No schedule opened by doctor
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      expect(result.operationalStatus).toBe(
        SHIFT_OPERATIONAL_STATUS.NO_PRACTICE,
      );
      expect(result.operationalLabel).toBe('Tidak Ada Praktik');
      expect(result.counts.unscheduled).toBe(12);
      expect(result.counts.scheduled).toBe(0);

      const firstSlot = result.slots[0]; // 00:00 - 00:30
      expect(firstSlot.temporalState).toBe(TEMPORAL_STATE.PAST);
      expect(firstSlot.availabilityState).toBe(AVAILABILITY_STATE.UNSCHEDULED);
      // Crucial fix verification: Must NOT be EXPIRED!
      expect(firstSlot.effectiveStatus).toBe(EFFECTIVE_SLOT_STATUS.UNSCHEDULED);
      expect(firstSlot.uiStatus).toBe(SLOT_UI_STATUS.UNSCHEDULED_PAST);
      expect(firstSlot.uiLabel).toBe('Belum Terjadwal');
      expect(firstSlot.uiVariant).toBe(SLOT_UI_VARIANT.NEUTRAL_DISABLED);
      expect(firstSlot.isClickable).toBe(false);
      expect(firstSlot.actionType).toBe(SLOT_ACTION_TYPE.NONE);
    });

    it('should assign COMPLETED and muted_gray for scheduled slots in the past, distinguishing available from occupied', () => {
      // Morning context 06:00 - 12:00, evaluated at 17:15 (all past)
      const input: SlotStateResolverInput = {
        scheduleDate: BASE_DATE,
        context: 'morning',
        intervalMinutes: 30,
        currentDate: BASE_DATE,
        currentTime: '17:15',
        openedRanges: [
          {
            id: 'sess-pagi',
            startTime: '08:00',
            endTime: '10:00',
            status: 'open',
          },
        ],
        appointments: [
          {
            id: 'appt-1',
            patientName: 'Bdn. Laras',
            startTime: '08:30',
            endTime: '09:00',
            status: 'completed',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);

      // 08:00 - 08:30: Available in the past -> COMPLETED, Selesai, muted_gray
      const availPastSlot = result.slots.find((s) => s.startTime === '08:00');
      expect(availPastSlot?.availabilityState).toBe('AVAILABLE');
      expect(availPastSlot?.temporalState).toBe('PAST');
      expect(availPastSlot?.effectiveStatus).toBe('EXPIRED');
      expect(availPastSlot?.uiStatus).toBe('COMPLETED');
      expect(availPastSlot?.uiLabel).toBe('Selesai');
      expect(availPastSlot?.uiVariant).toBe('muted_gray');
      expect(availPastSlot?.actionType).toBe('VIEW_SESSION');

      // 08:30 - 09:00: Occupied in the past -> COMPLETED, Selesai: Bdn. Laras, muted_gray
      const occPastSlot = result.slots.find((s) => s.startTime === '08:30');
      expect(occPastSlot?.availabilityState).toBe('OCCUPIED');
      expect(occPastSlot?.temporalState).toBe('PAST');
      expect(occPastSlot?.effectiveStatus).toBe('EXPIRED');
      expect(occPastSlot?.uiStatus).toBe('COMPLETED');
      expect(occPastSlot?.uiLabel).toBe('Selesai: Bdn. Laras');
      expect(occPastSlot?.uiVariant).toBe('muted_gray');
      expect(occPastSlot?.actionType).toBe('VIEW_SESSION');

      // 06:00 - 06:30: Unscheduled in the past -> UNSCHEDULED_PAST, Belum Terjadwal, neutral_disabled
      const unschedPastSlot = result.slots.find((s) => s.startTime === '06:00');
      expect(unschedPastSlot?.availabilityState).toBe('UNSCHEDULED');
      expect(unschedPastSlot?.effectiveStatus).toBe('UNSCHEDULED');
      expect(unschedPastSlot?.uiStatus).toBe('UNSCHEDULED_PAST');
      expect(unschedPastSlot?.uiLabel).toBe('Belum Terjadwal');
      expect(unschedPastSlot?.uiVariant).toBe('neutral_disabled');
    });

    it('should resolve slot as OCCUPIED_BY_OTHER with purple_other variant when another doctor occupies the room', () => {
      const input: SlotStateResolverInput = {
        scheduleDate: '2026-10-01',
        context: 'night',
        intervalMinutes: 30,
        currentDate: '2026-09-25',
        currentTime: '10:00',
        openedRanges: [],
        otherDoctorRoomOccupancies: [
          {
            sessionId: 'sess-other-1',
            practitionerId: 'prac-other-1',
            practitionerName: 'dr. Sarah Sp.A',
            specialty: 'Spesialis Anak',
            roomId: 'room-kia-1',
            roomName: 'Ruang KIA 1',
            startTime: '18:00',
            endTime: '19:00',
          },
        ],
      };

      const result = ScheduleSlotStateResolver.resolveContextProjection(input);
      const slot1800 = result.slots.find((s) => s.startTime === '18:00');
      const slot1830 = result.slots.find((s) => s.startTime === '18:30');
      const slot1900 = result.slots.find((s) => s.startTime === '19:00');

      expect(slot1800?.uiVariant).toBe('purple_other');
      expect(slot1800?.uiStatus).toBe('OCCUPIED_BY_OTHER');
      expect(slot1800?.actionType).toBe('VIEW_OCCUPANCY_CONFLICT');
      expect(slot1800?.conflictInfo?.type).toBe('ROOM_COLLISION_OTHER_DOCTOR');
      expect(slot1800?.conflictInfo?.practitionerName).toBe('dr. Sarah Sp.A');

      expect(slot1830?.uiVariant).toBe('purple_other');
      expect(slot1900?.uiVariant).toBe('dashed_border');
    });
  });
});
