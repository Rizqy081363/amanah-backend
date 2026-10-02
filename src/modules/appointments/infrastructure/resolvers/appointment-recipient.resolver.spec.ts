import { describe, expect, it, mock } from 'bun:test';
import { CLINIC_ADMIN_STAFF_ROLE_CODES } from '../../domain/constants/appointment-lifecycle.constants';
import { AppointmentRecipientResolver } from './appointment-recipient.resolver';

describe('AppointmentRecipientResolver', () => {
  it('should return empty array if database is not injected', async () => {
    const resolver = new AppointmentRecipientResolver(undefined);
    const result = await resolver.resolveAdminAndStaffUserIds();
    expect(result).toEqual([]);
  });

  it('should query userIds for admin and staff roles including doctors and midwives', async () => {
    const mockDb: any = {
      select: mock().mockReturnThis(),
      from: mock().mockReturnThis(),
      innerJoin: mock().mockReturnThis(),
      where: mock().mockResolvedValue([
        { userId: 'admin-user-1' },
        { userId: 'doctor-user-1' },
        { userId: 'midwife-user-1' },
        { userId: 'admin-user-1' }, // Duplicate check
      ]),
    };

    const resolver = new AppointmentRecipientResolver(mockDb);
    const result = await resolver.resolveAdminAndStaffUserIds();

    expect(result).toEqual(['admin-user-1', 'doctor-user-1', 'midwife-user-1']);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('should include canonical role codes in constant', () => {
    expect(CLINIC_ADMIN_STAFF_ROLE_CODES).toContain('admin');
    expect(CLINIC_ADMIN_STAFF_ROLE_CODES).toContain('staff_doctor');
    expect(CLINIC_ADMIN_STAFF_ROLE_CODES).toContain('staff_midwife');
    expect(CLINIC_ADMIN_STAFF_ROLE_CODES).toContain('staff_worker');
  });
});
