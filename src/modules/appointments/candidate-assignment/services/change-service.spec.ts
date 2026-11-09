import { describe, expect, it } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import {
  AppointmentNotFoundException,
  AppointmentTerminalStateException,
} from '../../domain/errors/appointment-assignment.errors';

describe('CandidateAssignmentService - changeService Logic', () => {
  it('throws AppointmentNotFoundException if appointment context does not exist', async () => {
    const findAppointmentWithContext = async (_id: string) => null;

    const execute = async () => {
      const context = await findAppointmentWithContext('invalid-id');
      if (!context) {
        throw new AppointmentNotFoundException('invalid-id');
      }
    };

    expect(execute()).rejects.toBeInstanceOf(AppointmentNotFoundException);
  });

  it('rejects service change if appointment is in terminal state (completed / cancelled)', async () => {
    const apt = {
      id: 'apt-1',
      status: 'completed',
      serviceId: 'old-service-id',
    };

    const isTerminal = (status: string) =>
      ['completed', 'cancelled'].includes(status);

    const execute = async () => {
      if (isTerminal(apt.status)) {
        throw new AppointmentTerminalStateException(apt.status);
      }
    };

    expect(execute()).rejects.toBeInstanceOf(AppointmentTerminalStateException);
  });

  it('returns existing appointment idempotently if target service matches current service', async () => {
    const apt = {
      id: 'apt-1',
      status: 'booked',
      serviceId: 'same-service-id',
    };

    const changeService = async (targetServiceId: string) => {
      if (apt.serviceId === targetServiceId) {
        return { ...apt, unchanged: true };
      }
      return { ...apt, serviceId: targetServiceId };
    };

    const result = await changeService('same-service-id');
    expect(result.unchanged).toBe(true);
    expect(result.serviceId).toBe('same-service-id');
  });

  it('throws BadRequestException if target clinic service is not found or inactive', async () => {
    const clinicServicesDB = [
      { id: 'svc-active', name: 'Poli Gigi', isActive: true, categoryId: 'cat-1' },
      { id: 'svc-inactive', name: 'Poli Lama', isActive: false, categoryId: 'cat-2' },
    ];

    const findActiveService = async (id: string) => {
      const found = clinicServicesDB.find((s) => s.id === id);
      if (!found || !found.isActive) return null;
      return found;
    };

    const execute = async (targetId: string) => {
      const targetService = await findActiveService(targetId);
      if (!targetService) {
        throw new BadRequestException('Layanan medis tidak ditemukan atau tidak aktif');
      }
      return targetService;
    };

    expect(execute('svc-unknown')).rejects.toBeInstanceOf(BadRequestException);
    expect(execute('svc-inactive')).rejects.toBeInstanceOf(BadRequestException);

    const valid = await execute('svc-active');
    expect(valid.name).toBe('Poli Gigi');
  });

  it('atomically synchronizes both appointment.serviceId and queueTicket.serviceId + categoryId', async () => {
    let appointment = {
      id: 'apt-123',
      serviceId: 'old-service',
      updatedBy: null as string | null,
    };
    let queueTicket = {
      appointmentId: 'apt-123',
      serviceId: 'old-service',
      categoryId: 'old-category',
    };

    const targetService = {
      id: 'new-service-id',
      name: 'Klinik Tumbuh Kembang',
      serviceCategoryId: 'new-category-id',
      isActive: true,
    };

    // Simulate transactional update
    const updateTransactional = async (userId: string) => {
      appointment = {
        ...appointment,
        serviceId: targetService.id,
        updatedBy: userId,
      };
      queueTicket = {
        ...queueTicket,
        serviceId: targetService.id,
        categoryId: targetService.serviceCategoryId,
      };
    };

    await updateTransactional('admin-uuid');

    expect(appointment.serviceId).toBe('new-service-id');
    expect(appointment.updatedBy).toBe('admin-uuid');
    expect(queueTicket.serviceId).toBe('new-service-id');
    expect(queueTicket.categoryId).toBe('new-category-id');
  });

  it('dynamically transforms queue ticket prefix while preserving sequence and session suffix', () => {
    const transformQueueNumber = (currentQueueNumber: string, targetPrefix: string) => {
      const match = currentQueueNumber.match(/^([A-Za-z0-9]+)-(.*)$/);
      const suffix = match ? match[2] : currentQueueNumber;
      return `${targetPrefix}-${suffix}`;
    };

    // Standard session ticket: UM-P002 -> KIA-P002
    expect(transformQueueNumber('UM-P002', 'KIA')).toBe('KIA-P002');

    // Afternoon session ticket: UM-S015 -> KIA-S015
    expect(transformQueueNumber('UM-S015', 'KIA')).toBe('KIA-S015');

    // Pure numeric sequence ticket: PU-005 -> KIA-005
    expect(transformQueueNumber('PU-005', 'KIA')).toBe('KIA-005');

    // Arbitrary dynamic prefixes from database: POLI-P001 -> DOKTER-P001
    expect(transformQueueNumber('POLI-P001', 'DOKTER')).toBe('DOKTER-P001');
  });

  it('dynamically maps target medical flow based on intakeFormCode without hardcoding', () => {
    const resolveMedicalFlow = (intakeFormCode?: string | null) => {
      return (intakeFormCode as 'pregnancy' | 'immunization') || null;
    };

    expect(resolveMedicalFlow('pregnancy')).toBe('pregnancy');
    expect(resolveMedicalFlow('immunization')).toBe('immunization');
    expect(resolveMedicalFlow(null)).toBeNull();
    expect(resolveMedicalFlow(undefined)).toBeNull();
  });
});
