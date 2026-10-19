import { AttendanceEntity } from '../../../domain/entities/attendance.entity';
import { QrSessionEntity } from '../../../domain/entities/qr-session.entity';

export class AttendanceMapper {
  static toAttendanceEntity(r: any): AttendanceEntity {
    return {
      id: r.id,
      staffId: r.staffProfileId,
      shift: r.shift,
      status: r.status,
      checkInAt: r.checkInAt ? new Date(r.checkInAt) : null,
      checkOutAt: r.checkOutAt ? new Date(r.checkOutAt) : null,
      validatedDurationHours: r.validatedDurationHours
        ? Number(r.validatedDurationHours)
        : undefined,
      isReplacement: Boolean(r.isReplacement),
      replacementOpportunityId: r.replacementOpportunityId || null,
      sessionId: r.sessionId || null,
      deviceInfo: r.notes || null,
      attendanceDate: r.attendanceDate,
      lateMinutes: r.lateMinutes ?? null,
      createdAt: new Date(r.createdAt),
    };
  }

  static toQrSessionEntity(r: any): QrSessionEntity {
    return {
      id: r.id,
      qrCodeIdentifier: r.codeHash,
      shift: r.shift || 'morning',
      rotationSeconds: r.rotationSeconds,
      validFrom: new Date(r.validFrom),
      validUntil: new Date(r.validUntil),
      isActive: r.isActive,
      context: r.context,
      createdBy: r.createdBy,
    };
  }
}
