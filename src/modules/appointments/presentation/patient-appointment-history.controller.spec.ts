import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { PatientAppointmentHistoryController } from './patient-appointment-history.controller';

describe('PatientAppointmentHistoryController', () => {
  let controller: PatientAppointmentHistoryController;
  let mockHistoryService: any;
  let mockDb: any;

  beforeEach(() => {
    mockHistoryService = {
      getHistory: mock().mockResolvedValue({
        data: [
          {
            id: 'apt-comp-1',
            bookingCode: 'BK-001',
            status: 'completed',
            scheduledDate: '2026-09-20',
            scheduledStartTime: '09:00:00',
            poliklinikName: 'Poli Umum',
            doctorName: 'dr. Andi',
            callAttemptsCount: 1,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    };

    mockDb = {
      query: {
        patientProfiles: {
          findFirst: mock().mockResolvedValue({
            id: 'patient-prof-99',
            userId: 'user-patient-99',
          }),
        },
      },
    };

    controller = new PatientAppointmentHistoryController(
      mockHistoryService,
      mockDb,
    );
  });

  it('should return empty list if user has no patient profile', async () => {
    mockDb.query.patientProfiles.findFirst.mockResolvedValueOnce(null);

    const result = await controller.getMyHistory({}, { id: 'unknown-user' });

    expect(result.total).toBe(0);
    expect(result.data).toEqual([]);
    expect(mockHistoryService.getHistory).not.toHaveBeenCalled();
  });

  it('should resolve patient profile and fetch history for logged-in user', async () => {
    const result = await controller.getMyHistory(
      { page: 1, limit: 10 },
      { id: 'user-patient-99' },
    );

    expect(result.total).toBe(1);
    expect(result.data[0].status).toBe('completed');
    expect(mockHistoryService.getHistory).toHaveBeenCalledWith(
      'patient-prof-99',
      { page: 1, limit: 10 },
    );
  });

  it('should fetch history by patientId for staff/admin', async () => {
    const result = await controller.getPatientHistory(
      'patient-prof-123',
      { status: 'no_show' },
    );

    expect(result.total).toBe(1);
    expect(mockHistoryService.getHistory).toHaveBeenCalledWith(
      'patient-prof-123',
      { status: 'no_show' },
    );
  });
});
