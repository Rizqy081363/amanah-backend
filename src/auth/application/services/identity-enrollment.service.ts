import {
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ROLE_AUDIENCE } from '../../../common/constants/role-audience.constants';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { roles, staffInvitations } from '../../../database/schema/amanah.schema';
import { STAFF_INVITATION_STATUS } from '../../../modules/staffs/domain/constants/staff-invitation.constants';

@Injectable()
export class IdentityEnrollmentService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  /**
   * Resolves the default eligible role for external self-registration (email/password or Google).
   * Strict Fail-Closed (Deny-by-Default):
   * 1. Looks for an active role with audience='external' and isDefault=true.
   * 2. If no default is explicitly marked, looks for an active external role.
   * 3. If zero active external roles exist, throws an UnprocessableEntityException.
   */
  async resolveExternalRegistrationRole() {
    // 1. Try to find designated default external role
    const defaultExternalRole = await this.db.query.roles.findFirst({
      where: and(
        eq(roles.audience, ROLE_AUDIENCE.EXTERNAL),
        eq(roles.isActive, true),
        eq(roles.isDefault, true),
      ),
    });

    if (defaultExternalRole) {
      return defaultExternalRole;
    }

    // 2. Check if any active external role exists
    const anyExternalRole = await this.db.query.roles.findFirst({
      where: and(
        eq(roles.audience, ROLE_AUDIENCE.EXTERNAL),
        eq(roles.isActive, true),
      ),
    });

    if (anyExternalRole) {
      return anyExternalRole;
    }

    // Fail-Closed: zero external roles available in clinic database
    throw new UnprocessableEntityException({
      code: 'AUTH_NO_ELIGIBLE_EXTERNAL_ROLE',
      message:
        'Pendaftaran akun tidak dapat diproses: Belum ada peran pengunjung/pasien yang aktif di sistem klinik. Hubungi administrator klinik.',
    });
  }

  /**
   * Validates internal staff invitation before onboarding or acceptance.
   * Ensures invitation is not expired and referenced role is active and exists.
   */
  async validateStaffInvitation(email: string) {
    const pendingInvitation = await this.db.query.staffInvitations.findFirst({
      where: and(
        eq(staffInvitations.email, email.toLowerCase()),
        eq(staffInvitations.status, STAFF_INVITATION_STATUS.PENDING),
      ),
    });

    if (!pendingInvitation) {
      return null;
    }

    const now = new Date();
    if (
      pendingInvitation.expiresAt &&
      new Date(pendingInvitation.expiresAt) < now
    ) {
      throw new ForbiddenException({
        code: 'INVITATION_EXPIRED',
        message:
          'Tautan undangan staf telah kedaluwarsa. Hubungi administrator untuk mengirimkan undangan baru.',
      });
    }

    if (pendingInvitation.roleId) {
      const targetRole = await this.db.query.roles.findFirst({
        where: eq(roles.id, pendingInvitation.roleId),
      });

      if (!targetRole || !targetRole.isActive) {
        throw new ForbiddenException({
          code: 'INVITATION_ROLE_INACTIVE',
          message:
            'Peran yang ditugaskan dalam undangan ini sudah tidak aktif atau telah dihapus.',
        });
      }

      return { invitation: pendingInvitation, role: targetRole };
    }

    return { invitation: pendingInvitation, role: null };
  }
}
