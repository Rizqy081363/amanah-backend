import { beforeEach, describe, expect, it } from 'bun:test';
import { NotificationRulesRegistry } from '../notifications/registry/notification-rules-registry';
import { AppointmentsNotificationRules } from './appointments.notifications';
import { APPOINTMENT_EVENTS } from './domain/constants/appointment-lifecycle.constants';

describe('AppointmentsNotificationRules', () => {
  let rules: AppointmentsNotificationRules;
  let registry: NotificationRulesRegistry;

  beforeEach(() => {
    registry = new NotificationRulesRegistry();
    rules = new AppointmentsNotificationRules(registry);
    rules.onModuleInit();
  });

  it('should register patient called rule with proper template and urgency', () => {
    const rule = registry.get(APPOINTMENT_EVENTS.PATIENT_CALLED);
    expect(rule).toBeDefined();
    expect(rule?.category).toBe('appointment');
    expect(rule?.isUrgent).toBe(true);
    expect(rule?.defaultChannels).toEqual(['in_app']);

    const payload = {
      patientUserId: 'user-p-1',
      ticketNumber: 'A-05',
      poliklinikName: 'Poli KIA',
      attemptNumber: 1,
      maxAttempts: 3,
      appointmentId: 'apt-1',
    };

    expect(rule?.resolveRecipients(payload)).toBe('user-p-1');
    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain('Nomor antrean A-05');
    expect(body).toContain('Poli KIA');
    expect(body).toContain('Panggilan ke-1 dari 3');
  });

  it('should register requeued rule with proper remaining attempts', () => {
    const rule = registry.get(APPOINTMENT_EVENTS.PATIENT_REQUEUED);
    expect(rule).toBeDefined();

    const payload = {
      patientUserId: 'user-p-1',
      ticketNumber: 'A-05',
      attemptNumber: 1,
      remainingAttempts: 2,
      appointmentId: 'apt-1',
    };

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain('digeser 3 posisi ke belakang');
    expect(body).toContain('Sisa kesempatan panggilan: 2 kali');
  });

  it('should register no show rule with urgent flag and cancel message', () => {
    const rule = registry.get(APPOINTMENT_EVENTS.NO_SHOW);
    expect(rule).toBeDefined();
    expect(rule?.isUrgent).toBe(true);

    const payload = {
      patientUserId: 'user-p-1',
      totalAttempts: 3,
      poliklinikName: 'Poli Umum',
      appointmentId: 'apt-1',
    };

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain('setelah 3 kali pemanggilan');
    expect(body).toContain('No-Show');
  });

  it('should register completed rule under clinical category', () => {
    const rule = registry.get(APPOINTMENT_EVENTS.COMPLETED);
    expect(rule).toBeDefined();
    expect(rule?.category).toBe('clinical');

    const payload = {
      patientUserId: 'user-p-1',
      poliklinikName: 'Poli Umum',
      appointmentId: 'apt-1',
    };

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain(
      'Konsultasi dan pemeriksaan medis di Poli Umum telah selesai',
    );
  });

  it('should register appointment created rule for patient and staff alert', async () => {
    const mockResolver = {
      resolveAdminAndStaffUserIds: async () => ['staff-1', 'admin-1'],
    };
    const localRules = new AppointmentsNotificationRules(
      registry,
      mockResolver as any,
    );
    localRules.onModuleInit();

    const rule = registry.get(APPOINTMENT_EVENTS.CREATED);
    expect(rule).toBeDefined();
    expect(rule?.category).toBe('appointment');
    expect(rule?.defaultChannels).toEqual(['in_app']);

    const payload = {
      patientUserId: 'patient-123',
      patientName: 'Dewi Lestari',
      patientAvatarUrl: 'https://cdn.amanah.com/avatars/dewi.webp',
      queueNumber: 'P-005',
      appointmentDate: '2026-09-30',
      session: 'PAGI',
      appointmentId: 'apt-created-123',
    };

    const recipients = await rule?.resolveRecipients(payload);
    expect(recipients).toContain('patient-123');
    expect(recipients).toContain('staff-1');
    expect(recipients).toContain('admin-1');

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain('Nomor antrean P-005');
    expect(body).toContain('atas nama Dewi Lestari');
    expect(body).toContain('2026-09-30');

    const senderName =
      typeof rule?.senderName === 'function'
        ? rule.senderName(payload)
        : rule?.senderName;
    expect(senderName).toBe('Dewi Lestari');

    const visualKey =
      typeof rule?.visualKey === 'function'
        ? rule.visualKey(payload)
        : rule?.visualKey;
    expect(visualKey).toBe('https://cdn.amanah.com/avatars/dewi.webp');
  });

  it('should register appointment cancelled rule notifying staff when cancelled by patient', async () => {
    const mockResolver = {
      resolveAdminAndStaffUserIds: async () => ['staff-1', 'admin-1'],
    };
    const localRules = new AppointmentsNotificationRules(
      registry,
      mockResolver as any,
    );
    localRules.onModuleInit();

    const rule = registry.get(APPOINTMENT_EVENTS.CANCELLED);
    expect(rule).toBeDefined();
    expect(rule?.category).toBe('appointment');
    expect(rule?.isUrgent).toBe(true);

    const payload = {
      appointmentId: 'apt-cancel-1',
      patientUserId: 'patient-999',
      patientName: 'Budi Santoso',
      patientAvatarUrl: 'https://cdn.amanah.com/avatars/budi.webp',
      doctorName: 'dr. Rizky',
      queueNumber: 'P-002',
      appointmentDate: '2026-10-01',
      session: 'PAGI',
      cancelledByRole: 'patient',
      reason: 'Ada acara keluarga mendadak',
    };

    const recipients = await rule?.resolveRecipients(payload);
    expect(recipients).toContain('staff-1');
    expect(recipients).toContain('admin-1');

    const title =
      typeof rule?.titleTemplate === 'function'
        ? rule.titleTemplate(payload)
        : rule?.titleTemplate;
    expect(title).toBe('Pembatalan Janji Temu Pasien');

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain('Pasien Budi Santoso membatalkan janji temu');
    expect(body).toContain('P-002');
    expect(body).toContain('Slot kuota telah dipulihkan');

    const senderName =
      typeof rule?.senderName === 'function'
        ? rule.senderName(payload)
        : rule?.senderName;
    expect(senderName).toBe('Budi Santoso');

    const visualKey =
      typeof rule?.visualKey === 'function'
        ? rule.visualKey(payload)
        : rule?.visualKey;
    expect(visualKey).toBe('https://cdn.amanah.com/avatars/budi.webp');
  });

  it('should register appointment cancelled rule notifying patient when cancelled by admin', async () => {
    const localRules = new AppointmentsNotificationRules(registry);
    localRules.onModuleInit();

    const rule = registry.get(APPOINTMENT_EVENTS.CANCELLED);
    expect(rule).toBeDefined();

    const payload = {
      appointmentId: 'apt-cancel-2',
      patientUserId: 'patient-888',
      doctorName: 'dr. Siti',
      doctorAvatarUrl: 'https://cdn.amanah.com/avatars/drsiti.webp',
      queueNumber: 'P-003',
      appointmentDate: '2026-10-02',
      session: 'SIANG',
      cancelledByRole: 'admin',
      reason: 'Dokter berhalangan karena tugas luar kota',
    };

    const recipients = await rule?.resolveRecipients(payload);
    expect(recipients).toEqual(['patient-888']);

    const title =
      typeof rule?.titleTemplate === 'function'
        ? rule.titleTemplate(payload)
        : rule?.titleTemplate;
    expect(title).toBe('Janji Temu Dibatalkan oleh Klinik');

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain('telah dibatalkan oleh pihak klinik');
    expect(body).toContain('Dokter berhalangan karena tugas luar kota');

    const senderName =
      typeof rule?.senderName === 'function'
        ? rule.senderName(payload)
        : rule?.senderName;
    expect(senderName).toBe('Klinik Amanah');

    const visualKey =
      typeof rule?.visualKey === 'function'
        ? rule.visualKey(payload)
        : rule?.visualKey;
    expect(visualKey).toBe('https://cdn.amanah.com/avatars/drsiti.webp');
  });

  it('should register appointment rescheduled rule notifying staff when rescheduled by patient', async () => {
    const mockResolver = {
      resolveAdminAndStaffUserIds: async () => ['staff-1', 'admin-1'],
    };
    const localRules = new AppointmentsNotificationRules(
      registry,
      mockResolver as any,
    );
    localRules.onModuleInit();

    const rule = registry.get(APPOINTMENT_EVENTS.RESCHEDULED);
    expect(rule).toBeDefined();
    expect(rule?.category).toBe('appointment');

    const payload = {
      appointmentId: 'apt-resched-1',
      patientUserId: 'patient-123',
      patientName: 'Lexguard Didier',
      patientAvatarUrl: 'https://cdn.amanah.com/avatars/lex.webp',
      doctorName: 'dr. Ahmad Santoso',
      queueNumber: 'P-001',
      appointmentDate: '2026-10-01',
      targetDate: '2026-10-01',
      targetStartTime: '18:00:00',
      targetEndTime: '18:30:00',
      rescheduledByRole: 'patient',
      reason: 'Pindah ke shift malam',
    };

    const recipients = await rule?.resolveRecipients(payload);
    expect(recipients).toContain('staff-1');
    expect(recipients).toContain('admin-1');
    expect(recipients).toContain('patient-123');

    const title =
      typeof rule?.titleTemplate === 'function'
        ? rule.titleTemplate(payload)
        : rule?.titleTemplate;
    expect(title).toBe('Perubahan Jadwal Janji Temu Pasien');

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain('Pasien Lexguard Didier');
    expect(body).toContain('telah memindahkan jadwal');
    expect(body).toContain('18:00:00 - 18:30:00');
  });

  it('should register appointment rescheduled rule notifying patient when rescheduled by admin', async () => {
    const localRules = new AppointmentsNotificationRules(registry);
    localRules.onModuleInit();

    const rule = registry.get(APPOINTMENT_EVENTS.RESCHEDULED);
    expect(rule).toBeDefined();

    const payload = {
      appointmentId: 'apt-resched-2',
      patientUserId: 'patient-456',
      doctorName: 'dr. Ahmad Santoso',
      doctorAvatarUrl: 'https://cdn.amanah.com/avatars/drahmad.webp',
      queueNumber: 'P-002',
      appointmentDate: '2026-10-02',
      targetDate: '2026-10-02',
      targetStartTime: '09:00:00',
      targetEndTime: '09:30:00',
      rescheduledByRole: 'admin',
      reason: 'Penyesuaian jadwal dokter di RSUD',
    };

    const recipients = await rule?.resolveRecipients(payload);
    expect(recipients).toEqual(['patient-456']);

    const title =
      typeof rule?.titleTemplate === 'function'
        ? rule.titleTemplate(payload)
        : rule?.titleTemplate;
    expect(title).toBe('Jadwal Janji Temu Diperbarui oleh Klinik');

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(payload)
        : rule?.bodyTemplate;
    expect(body).toContain('telah dipindahkan ke tanggal 2026-10-02');
    expect(body).toContain('Penyesuaian jadwal dokter di RSUD');
  });

  it('should register appointment assignment updated rule notifying patient of doctor or room change', async () => {
    const rule = registry.get(APPOINTMENT_EVENTS.ASSIGNMENT_UPDATED);
    expect(rule).toBeDefined();
    expect(rule?.category).toBe('appointment');

    const doctorChangePayload = {
      appointmentId: 'apt-789',
      patientUserId: 'patient-789',
      doctorName: 'dr. Ahmad Santoso',
      changeType: 'doctor',
      scheduledDate: '2026-10-05',
      scheduledStartTime: '08:00:00',
    };

    const recipients = await rule?.resolveRecipients(doctorChangePayload);
    expect(recipients).toEqual(['patient-789']);

    const doctorTitle =
      typeof rule?.titleTemplate === 'function'
        ? rule.titleTemplate(doctorChangePayload)
        : rule?.titleTemplate;
    expect(doctorTitle).toBe('Perubahan Dokter Janji Temu');

    const doctorBody =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(doctorChangePayload)
        : rule?.bodyTemplate;
    expect(doctorBody).toContain('dialihkan ke dr. Ahmad Santoso');

    const roomChangePayload = {
      appointmentId: 'apt-789',
      patientUserId: 'patient-789',
      roomName: 'Ruang Poli Umum 1',
      changeType: 'room',
      scheduledDate: '2026-10-05',
      scheduledStartTime: '08:00:00',
    };

    const roomTitle =
      typeof rule?.titleTemplate === 'function'
        ? rule.titleTemplate(roomChangePayload)
        : rule?.titleTemplate;
    expect(roomTitle).toBe('Perubahan Ruangan Janji Temu');

    const roomBody =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate(roomChangePayload)
        : rule?.bodyTemplate;
    expect(roomBody).toContain('dialihkan ke Ruang Poli Umum 1');
  });
});
