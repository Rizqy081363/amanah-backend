import { describe, expect, it } from 'bun:test';
import { AppointmentPoliklinikResolver } from './appointment-poliklinik.resolver';

describe('AppointmentPoliklinikResolver', () => {
  it('resolves polyclinic directly from clinicRoom clinicUnit', async () => {
    const mockDb: any = {};
    const resolver = new AppointmentPoliklinikResolver(mockDb);

    const apt = {
      clinicRoom: {
        id: 'room-1',
        clinicUnit: {
          id: 'unit-1',
          name: 'Poli Umum',
        },
      },
    };

    const resolved = resolver.resolveSync(apt);
    expect(resolved.poliklinikId).toBe('unit-1');
    expect(resolved.poliklinikName).toBe('Poli Umum');
  });

  it('resolves polyclinic directly from practitioner staffProfile clinicUnit', async () => {
    const mockDb: any = {};
    const resolver = new AppointmentPoliklinikResolver(mockDb);

    const apt = {
      clinicRoom: null,
      practitioner: {
        staffProfile: {
          clinicUnit: {
            id: 'unit-2',
            name: 'Poli KIA',
          },
        },
      },
    };

    const resolved = resolver.resolveSync(apt);
    expect(resolved.poliklinikId).toBe('unit-2');
    expect(resolved.poliklinikName).toBe('Poli KIA');
  });
});
