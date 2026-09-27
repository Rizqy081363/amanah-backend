import { beforeEach, describe, expect, it } from 'bun:test';
import { NotificationRulesRegistry } from './notification-rules-registry';

describe('NotificationRulesRegistry', () => {
  let registry: NotificationRulesRegistry;

  beforeEach(() => {
    registry = new NotificationRulesRegistry();
  });

  it('should register and retrieve a notification rule', () => {
    registry.register<{ patientUserId: string; queueNumber: string }>({
      eventType: 'appointment.patient_called.v1',
      defaultChannels: ['in_app'],
      category: 'appointment',
      resolveRecipients: (payload) => payload.patientUserId,
      titleTemplate: 'Panggilan Dokter',
      bodyTemplate: (payload) =>
        `Nomor antrean ${payload.queueNumber} dipanggil.`,
    });

    expect(registry.has('appointment.patient_called.v1')).toBe(true);
    const rule = registry.get('appointment.patient_called.v1');
    expect(rule).toBeDefined();
    expect(rule?.defaultChannels).toEqual(['in_app']);
    expect(rule?.category).toBe('appointment');

    const recipient = rule?.resolveRecipients({
      patientUserId: 'user-patient-1',
    });
    expect(recipient).toBe('user-patient-1');

    const body =
      typeof rule?.bodyTemplate === 'function'
        ? rule.bodyTemplate({ queueNumber: 'A-001' })
        : rule?.bodyTemplate;
    expect(body).toBe('Nomor antrean A-001 dipanggil.');
  });

  it('should return undefined for unregistered event types', () => {
    expect(registry.has('unknown.event')).toBe(false);
    expect(registry.get('unknown.event')).toBeUndefined();
  });
});
