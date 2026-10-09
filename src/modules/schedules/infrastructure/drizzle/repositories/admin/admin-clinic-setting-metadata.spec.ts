import { describe, it, expect } from 'bun:test';
import {
  getClinicSettingMetadata,
  CLINIC_SETTING_METADATA_REGISTRY,
} from './admin-clinic-setting-metadata';

describe('AdminClinicSettingMetadata', () => {
  it('hides internal algorithm and infrastructure parameters from admin view', () => {
    const internalKeys = [
      'closure.min_open_segment_minutes',
      'closure.last_call_buffer_minutes',
      'closure.long_confirm_days',
      'eta.spread_z',
      'eta.update_threshold_minutes',
      'feature.legacy_compat',
      'duration.prior_weight',
      'duration.window_days',
      'duration.min_samples',
      'duration.stale_factor',
      'queue.load_ratio.ok_max',
      'queue.load_ratio.busy_max',
    ];

    for (const key of internalKeys) {
      const meta = getClinicSettingMetadata(key);
      expect(meta.isAdminFacing).toBe(false);
    }
  });

  it('exposes admin-facing operational parameters with clear Indonesian labels and controls', () => {
    const timezone = getClinicSettingMetadata('clinic.timezone');
    expect(timezone.isAdminFacing).toBe(true);
    expect(timezone.label).toBe('Zona Waktu Operasional');
    expect(timezone.controlType).toBe('select');
    expect(timezone.options?.length).toBe(3);

    const locale = getClinicSettingMetadata('clinic.locale');
    expect(locale.isAdminFacing).toBe(true);
    expect(locale.label).toBe('Negara & Format Bahasa');
    expect(locale.controlType).toBe('select');
    expect(locale.options?.[0].flagCode).toBe('id');
    expect(locale.options?.[0].countryCode).toBe('ID');

    const duration = getClinicSettingMetadata('duration.prior_minutes');
    expect(duration.isAdminFacing).toBe(true);
    expect(duration.controlType).toBe('number');
    expect(duration.unit).toBe('menit');
    expect(duration.min).toBe(5);

    const toggle = getClinicSettingMetadata('ticket.show_doctor_when_called');
    expect(toggle.isAdminFacing).toBe(true);
    expect(toggle.controlType).toBe('boolean');
  });

  it('defaults unmapped keys to hidden internal text parameters safely', () => {
    const unknown = getClinicSettingMetadata('nonexistent.parameter.key');
    expect(unknown.isAdminFacing).toBe(false);
    expect(unknown.controlType).toBe('text');
  });
});
