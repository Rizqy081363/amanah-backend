import { describe, expect, it, beforeEach } from 'bun:test';
import { AppointmentsNotificationRules } from './appointments.notifications';
import { NotificationRulesRegistry } from '../notifications/registry/notification-rules-registry';
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
});
