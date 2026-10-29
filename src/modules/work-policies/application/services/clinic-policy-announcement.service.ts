import { Injectable, Logger, Optional } from '@nestjs/common';
import { CANONICAL_ROLES } from '../../../../auth/constants/auth.constants';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';

export interface PolicyChangeNotificationPayload {
  module: 'leave' | 'payroll' | 'attendance' | 'schedule';
  title: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ClinicPolicyAnnouncementService {
  private readonly logger = new Logger(ClinicPolicyAnnouncementService.name);

  constructor(
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
  ) {}

  /**
   * Broadcasts a clinic policy change to all internal staff (Doctors, Midwives, Operational Workers).
   * Strict invariant: Never delivers to patient accounts.
   */
  async announcePolicyChange(
    payload: PolicyChangeNotificationPayload,
  ): Promise<boolean> {
    if (!this.notificationGateway) {
      this.logger.warn(
        'NotificationGatewayService not injected; skipping clinic policy announcement.',
      );
      return false;
    }

    try {
      const commandId = `policy-${payload.module}-${Date.now()}`;

      await this.notificationGateway.dispatch({
        commandId,
        sourceDomain: payload.module,
        target: {
          type: 'role',
          roles: [
            CANONICAL_ROLES.STAFF_DOCTOR,
            CANONICAL_ROLES.STAFF_MIDWIFE,
            CANONICAL_ROLES.STAFF_WORKER,
          ],
        },
        category: 'shift',
        content: {
          title: payload.title,
          body: payload.body,
          actionUrl: payload.actionUrl || '/permission',
          data: {
            changeType: 'policy_updated',
            module: payload.module,
            audience: 'clinic',
            ...(payload.metadata || {}),
          },
        },
        channels: ['in_app', 'push'],
        priority: 'normal',
      });

      this.logger.log(
        `Announced clinic policy change [${payload.module}] to internal staff: "${payload.title}"`,
      );
      return true;
    } catch (err: any) {
      this.logger.error(
        `Failed to announce clinic policy change: ${err?.message || err}`,
      );
      return false;
    }
  }

  /**
   * Generates a concise, family-friendly Indonesian announcement summary for leave policy changes.
   */
  buildLeavePolicyChangeSummary(
    oldPolicy: {
      approvalRequired: boolean;
      limitMode: string;
      monthlyLimit: number;
      noticeDaysRequired?: number;
      periodPolicy: string;
    },
    newPolicy: {
      approvalRequired: boolean;
      limitMode: string;
      monthlyLimit: number;
      noticeDaysRequired?: number;
      periodPolicy: string;
    },
  ): { title: string; body: string } | null {
    const changes: string[] = [];

    if (oldPolicy.approvalRequired !== newPolicy.approvalRequired) {
      if (!newPolicy.approvalRequired) {
        changes.push(
          'Permohonan izin yang memenuhi syarat kini langsung disetujui otomatis oleh sistem.',
        );
      } else {
        changes.push(
          'Permohonan izin staf kini wajib melalui persetujuan manual Admin.',
        );
      }
    }

    if (
      oldPolicy.limitMode !== newPolicy.limitMode ||
      (newPolicy.limitMode === 'monthly_limit' &&
        oldPolicy.monthlyLimit !== newPolicy.monthlyLimit)
    ) {
      if (newPolicy.limitMode === 'unlimited') {
        changes.push('Batas kuota pengajuan izin bulanan ditiadakan.');
      } else {
        changes.push(
          `Batas kuota izin bulanan diubah menjadi maksimal ${newPolicy.monthlyLimit} kali per bulan.`,
        );
      }
    }

    const oldNotice = oldPolicy.noticeDaysRequired ?? 0;
    const newNotice = newPolicy.noticeDaysRequired ?? 0;
    if (oldNotice !== newNotice) {
      if (newNotice === 0) {
        changes.push('Izin kini dapat diajukan pada hari yang sama.');
      } else {
        changes.push(
          `Izin wajib diajukan minimal ${newNotice} hari sebelum tanggal mulai.`,
        );
      }
    }

    if (oldPolicy.periodPolicy !== newPolicy.periodPolicy) {
      if (newPolicy.periodPolicy === 'previous_period_must_finish') {
        changes.push(
          'Izin baru hanya dapat diajukan setelah masa izin sebelumnya selesai.',
        );
      } else {
        changes.push(
          'Izin tanggal mendatang dapat diajukan secara fleksibel selama tidak bertabrakan.',
        );
      }
    }

    if (changes.length === 0) {
      return null; // No meaningful change detected
    }

    return {
      title: 'Perubahan Aturan Cuti Klinik',
      body: changes.join(' '),
    };
  }
}
