import { ScheduleDrizzleRepository } from '../../schedule.drizzle-repository';
import { createMockDb } from '../../testing/schedule-test-mock';

describe('ScheduleDrizzleRepository - getAdminSessionPatients dual-linkage and self-healing', () => {
  const practitionerId = '8489be4c-7c05-4c07-b352-7bf579b29cb1';
  const sessionId = '3cb62e10-450b-43e5-aba9-49ec37079ebb';

  it('retrieves appointments with null scheduleSessionId matching practitioner, date, and session time window', async () => {
    const db = createMockDb();
    db.query.practitioners.findFirst.mockResolvedValue({
      id: practitionerId,
      displayName: 'dr. Ahmad Santoso',
    });
    db.query.practitionerScheduleSessions.findFirst.mockResolvedValue({
      id: sessionId,
      practitionerId,
      scheduleDate: '2026-09-24',
      startTime: '08:00:00',
      endTime: '12:00:00',
      capacity: 20,
      availableSlots: 18,
      status: 'open',
      sessionLabel: 'Sesi Pagi',
      sessionShift: 'morning',
      clinicRoom: { id: 'room-1', name: 'Ruang Poli 1', floor: 1 },
    });

    // 2 booked appointments where scheduleSessionId is null
    db.query.appointments.findMany.mockResolvedValue([
      {
        id: 'appt-1',
        scheduleSessionId: null,
        practitionerId,
        scheduledDate: '2026-09-24',
        scheduledStartTime: '08:00:00',
        scheduledEndTime: '08:30:00',
        status: 'booked',
        createdAt: new Date().toISOString(),
        patientProfile: {
          id: 'pat-1',
          fullName: 'Budi Santoso',
          medicalRecordNumber: 'RM-001',
          birthDate: '1990-01-01',
          gender: 'male',
        },
        queueTickets: [{ id: 'q-1', queueNumber: 'A-01' }],
        clinicRoom: null,
      },
      {
        id: 'appt-2',
        scheduleSessionId: null,
        practitionerId,
        scheduledDate: '2026-09-24',
        scheduledStartTime: '08:30:00',
        scheduledEndTime: '09:00:00',
        status: 'waiting',
        createdAt: new Date().toISOString(),
        patientProfile: {
          id: 'pat-2',
          fullName: 'Siti Aminah',
          medicalRecordNumber: 'RM-002',
          birthDate: '1995-05-15',
          gender: 'female',
        },
        queueTickets: [{ id: 'q-2', queueNumber: 'A-02' }],
        clinicRoom: null,
      },
    ]);

    const repository = new ScheduleDrizzleRepository(db as never);
    const res = await repository.getAdminSessionPatients(
      practitionerId,
      sessionId,
      { status: 'all' },
    );

    expect(res.success).toBe(true);
    expect(res.data.sessionId).toBe(sessionId);
    expect(res.data.capacity).toBe(20);
    expect(res.data.availableSlots).toBe(18);
    expect(res.data.bookedCount).toBe(2);
    expect(res.data.patients).toHaveLength(2);
    expect(res.data.patients[0].patient.fullName).toBe('Budi Santoso');
    expect(res.data.patients[1].patient.fullName).toBe('Siti Aminah');

    // Verify self-healing: db.update was triggered for appointments without scheduleSessionId
    expect(db.update).toHaveBeenCalled();
  });
});
