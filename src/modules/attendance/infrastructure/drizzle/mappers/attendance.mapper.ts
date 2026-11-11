import { AttendanceEntity } from '../../../domain/entities/attendance.entity';
import { QrSessionEntity } from '../../../domain/entities/qr-session.entity';

export class AttendanceMapper {
  static toAttendanceEntity(r: any): AttendanceEntity {
    return {
      id: r.id,
      staffId: r.staffProfileId,
      attendanceDate: r.attendanceDate,
      status: r.status,
      recordedMethod: r.recordedMethod,
      isReplacement: Boolean(r.isReplacement),
      isEarlyDeparture: Boolean(r.isEarlyDeparture),
      shift: r.shift ?? null,
      shiftLabel: r.shiftLabel || null,
      checkInAt: r.checkInAt ? new Date(r.checkInAt) : null,
      checkOutAt: r.checkOutAt ? new Date(r.checkOutAt) : null,
      validatedDurationHours: r.validatedDurationHours
        ? Number(r.validatedDurationHours)
        : null,
      replacementOpportunityId: r.replacementOpportunityId || null,
      sessionId: r.sessionId || null,
      deviceInfo: r.deviceInfo || null,
      lateMinutes: r.lateMinutes ?? null,
      recordedBy: r.recordedBy || null,
      notes: r.notes || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt || r.createdAt),
    };
  }

  static toQrSessionEntity(r: any): QrSessionEntity {
    return {
      id: r.id,
      qrCodeIdentifier: r.codeHash,
      shift: r.shift,
      rotationSeconds: r.rotationSeconds,
      validFrom: new Date(r.validFrom),
      validUntil: new Date(r.validUntil),
      isActive: r.isActive,
      context: r.context,
      createdBy: r.createdBy,
    };
  }
}
