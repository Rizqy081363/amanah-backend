import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { RedisService } from '../../../../common/redis/redis.service';
import { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';
import { AppointmentNotificationPublisher } from '../../application/appointment-notification.publisher';
import {
  REALTIME_EMITTER_PORT,
  type RealtimeEmitterPort,
} from '../../application/ports/realtime-emitter.port';
import {
  DB_APPOINTMENT_STATUS,
  isAppointmentServiceModifiable,
  isTerminalAppointmentStatus,
} from '../../domain/constants/appointment-lifecycle.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import {
  AppointmentNotFoundException,
  AppointmentTerminalStateException,
  DoctorCollisionException,
} from '../../domain/errors/appointment-assignment.errors';
import { toDomainStatus } from '../../domain/types/appointment.types';
import type {
  BulkOperationResult,
  ChangeDoctorOptions,
  ICandidateAssignmentPort,
} from '../contracts/candidate-assignment.contract';
import { DrizzleCandidateAssignmentRepository } from '../infrastructure/drizzle-candidate-assignment.repository';

@Injectable()
export class CandidateAssignmentService implements ICandidateAssignmentPort {
  constructor(
    private readonly repository: DrizzleCandidateAssignmentRepository,
    private readonly redisService: RedisService,
    private readonly notificationPublisher: AppointmentNotificationPublisher,
    @Inject('FIND_APPOINTMENT_BY_ID')
    private readonly findAppointmentById: (
      id: string,
    ) => Promise<AppointmentEntity | null>,
    @Optional()
    @Inject(REALTIME_EMITTER_PORT)
    private readonly realtimeEmitter?: RealtimeEmitterPort,
    @Optional()
    private readonly queueRecalculationService?: QueuePositionRecalculationService,
  ) {}

  async changeDoctor(
    appointmentId: string,
    targetDoctorId: string,
    options?: ChangeDoctorOptions,
    user?: any,
  ): Promise<AppointmentEntity> {
    const context =
      await this.repository.findAppointmentWithContext(appointmentId);
    if (!context || !context.appointment) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    const { appointment: apt } = context;

    if (!isAppointmentServiceModifiable(apt.status)) {
      throw new BadRequestException(
        `Layanan janji temu tidak dapat diubah pada status '${apt.status}'. Pemeriksaan yang sedang berlangsung (in_service) atau selesai (completed) tidak dapat dialihkan.`,
      );
    }

    if (apt.status === DB_APPOINTMENT_STATUS.IN_SERVICE) {
      throw new BadRequestException(
        'Pasien sedang diperiksa oleh dokter (in_service) dan tidak dapat dialihkan',
      );
    }

    if (apt.practitionerId === targetDoctorId) {
      const existing = await this.findAppointmentById(appointmentId);
      if (!existing) throw new AppointmentNotFoundException(appointmentId);
      return existing;
    }

    // Validate target doctor exists and accepts appointments
    const allPractitioners = await this.repository.findAllActivePractitioners();
    const targetDoc = allPractitioners.find((p) => p.id === targetDoctorId);

    if (!targetDoc) {
      throw new DoctorCollisionException(
        'Target Dokter',
        'Dokter tidak ditemukan atau tidak aktif menerima janji temu',
      );
    }

    if (targetDoc.staffProfile?.role && targetDoc.staffProfile.role.isClinical === false) {
      throw new BadRequestException(
        'Staf yang dipilih bukan merupakan tenaga medis klinis',
      );
    }

    // Check if target doctor is on leave on this service date
    const leaves = await this.repository.findActiveDoctorLeaves(
      apt.scheduledDate,
      context.queueTicket?.sessionId,
    );
    const isDocOnLeave = leaves.some((l) => l.doctorId === targetDoctorId);
    if (isDocOnLeave) {
      throw new BadRequestException(
        `Dokter ${targetDoc.displayName || targetDoc.staffProfile?.fullName || ''} sedang cuti pada tanggal ${apt.scheduledDate}.`,
      );
    }

    // Auto-resolve room if appointment has no room assigned yet
    let targetRoomId = apt.roomId;
    if (!targetRoomId) {
      targetRoomId = await this.repository.findDoctorPreferredRoomId(
        targetDoctorId,
        context.queueTicket?.sessionId,
      );
    }

    const defaultReason = `Tugaskan dokter ke ${targetDoc.displayName || targetDoc.staffProfile?.fullName || targetDoctorId}`;
    const finalReason = options?.reason
      ? `${options.reason} (Target: ${targetDoc.displayName || targetDoctorId})`
      : defaultReason;

    const currentUserId = user?.id || user?.sub || null;

    const previousDoctorId = apt.practitionerId;

    // Transactional atomic assignment without fragile slot collision locks
    await this.repository.updateAppointmentDoctorTransactional({
      appointmentId,
      targetDoctorId,
      previousDoctorId,
      targetRoomId,
      updatedBy: currentUserId,
      reason: finalReason,
      previousStatus: apt.status,
    });

    // Recalculate doctor queues to ensure sequential 1..N FIFO compaction
    if (this.queueRecalculationService) {
      // Recalculate target doctor's queue
      await this.queueRecalculationService.recalculateDoctorQueue({
        serviceDate: apt.scheduledDate,
        practitionerId: targetDoctorId,
      });

      // If appointment was previously unassigned, compact that category's unassigned pool
      if (!previousDoctorId) {
        const categoryId =
          apt.clinicService?.serviceCategoryId ||
          context.queueTicket?.categoryId ||
          null;
        await this.queueRecalculationService.recalculateDoctorQueue({
          serviceDate: apt.scheduledDate,
          practitionerId: null,
          categoryId,
        });
      } else if (previousDoctorId !== targetDoctorId) {
        // If appointment was previously assigned to another doctor, compact that doctor's queue
        await this.queueRecalculationService.recalculateDoctorQueue({
          serviceDate: apt.scheduledDate,
          practitionerId: previousDoctorId,
        });
      }
    }

    // Invalidate Redis caches
    await Promise.allSettled([
      this.redisService.deleteByPrefix('queue:'),
      this.redisService.deleteByPrefix('appointments:'),
      this.redisService.invalidateTags(
        'queue',
        'daily',
        'display',
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'appointments',
        'appointments:me',
      ),
    ]);

    const updated = await this.findAppointmentById(appointmentId);
    if (!updated) throw new AppointmentNotFoundException(appointmentId);

    // Publish real-time events via Socket.IO & NotificationPublisher
    await this.notificationPublisher.publishAssignmentChanged(
      updated,
      {
        doctorName: updated.doctorName,
        roomName: updated.roomName,
        type: 'practitioner',
      },
      user,
    );

    if (this.realtimeEmitter) {
      await this.realtimeEmitter.emitStatusChanged({
        appointmentId: updated.id,
        status: updated.status,
        previousStatus: toDomainStatus(apt.status),
        queueNumber: Number(updated.queueNumber) || 1,
        practitionerId: updated.staffId || '',
        patientUserId: updated.patientUserId,
      });
    }

    return updated;
  }

  async changeRoom(
    appointmentId: string,
    targetRoomId: string,
    user?: any,
  ): Promise<AppointmentEntity> {
    const context =
      await this.repository.findAppointmentWithContext(appointmentId);
    if (!context || !context.appointment) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    const { appointment: apt } = context;

    if (!isAppointmentServiceModifiable(apt.status)) {
      throw new BadRequestException(
        `Layanan janji temu tidak dapat diubah pada status '${apt.status}'. Pemeriksaan yang sedang berlangsung (in_service) atau selesai (completed) tidak dapat dialihkan.`,
      );
    }

    if (apt.roomId === targetRoomId) {
      const existing = await this.findAppointmentById(appointmentId);
      if (!existing) throw new AppointmentNotFoundException(appointmentId);
      return existing;
    }

    // Validate target room exists and is active
    const activeRooms = await this.repository.findAllActiveClinicRooms();
    const targetRoom = activeRooms.find((r) => r.id === targetRoomId);
    if (!targetRoom) {
      throw new BadRequestException('Ruangan tidak ditemukan atau tidak aktif');
    }

    const currentUserId = user?.id || user?.sub || null;

    // Transactional atomic assignment without fragile slot collision locks
    await this.repository.updateAppointmentRoomTransactional({
      appointmentId,
      targetRoomId,
      updatedBy: currentUserId,
      reason: `Tugaskan ruangan ke ${targetRoom.name}`,
      previousStatus: apt.status,
    });

    // Invalidate Redis caches
    await Promise.allSettled([
      this.redisService.deleteByPrefix('queue:'),
      this.redisService.deleteByPrefix('appointments:'),
      this.redisService.invalidateTags(
        'queue',
        'daily',
        'display',
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'appointments',
        'appointments:me',
      ),
    ]);

    const updated = await this.findAppointmentById(appointmentId);
    if (!updated) throw new AppointmentNotFoundException(appointmentId);

    // Publish real-time event
    await this.notificationPublisher.publishAssignmentChanged(
      updated,
      {
        doctorName: updated.doctorName,
        roomName: updated.roomName,
        type: 'room',
      },
      user,
    );

    if (this.realtimeEmitter) {
      await this.realtimeEmitter.emitStatusChanged({
        appointmentId: updated.id,
        status: updated.status,
        previousStatus: toDomainStatus(apt.status),
        queueNumber: Number(updated.queueNumber) || 1,
        practitionerId: updated.staffId || '',
        patientUserId: updated.patientUserId,
      });
    }

    return updated;
  }

  async changeService(
    appointmentId: string,
    targetServiceId: string,
    user?: any,
    options?: { complaint?: string },
  ): Promise<AppointmentEntity> {
    const context =
      await this.repository.findAppointmentWithContext(appointmentId);
    if (!context || !context.appointment) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    const { appointment: apt } = context;

    if (!isAppointmentServiceModifiable(apt.status)) {
      throw new BadRequestException(
        `Layanan janji temu tidak dapat diubah pada status '${apt.status}'. Pemeriksaan yang sedang berlangsung (in_service) atau selesai (completed) tidak dapat dialihkan.`,
      );
    }

    const currentUserId = user?.id || null;

    if (apt.serviceId === targetServiceId) {
      if (
        options?.complaint !== undefined &&
        options.complaint !== apt.complaint
      ) {
        await this.repository.updateAppointmentServiceTransactional({
          appointmentId,
          targetServiceId,
          targetCategoryId: apt.clinicService?.serviceCategoryId || null,
          targetMedicalFlow: apt.medicalFlow,
          targetQueuePrefix: undefined,
          complaint: options.complaint,
          updatedBy: currentUserId,
          reason: 'Perbarui keluhan utama janji temu',
          previousStatus: apt.status,
        });
      }
      const existing = await this.findAppointmentById(appointmentId);
      if (!existing) throw new AppointmentNotFoundException(appointmentId);
      return existing;
    }

    const targetService =
      await this.repository.findActiveClinicService(targetServiceId);
    if (!targetService) {
      throw new BadRequestException('Layanan medis tidak ditemukan atau tidak aktif');
    }

    const targetMedicalFlow =
      (targetService.intakeFormCode as 'pregnancy' | 'immunization') || null;

    await this.repository.updateAppointmentServiceTransactional({
      appointmentId,
      targetServiceId,
      targetCategoryId: targetService.serviceCategoryId,
      targetMedicalFlow,
      targetQueuePrefix: targetService.resolvedPrefix || targetService.codePrefix,
      targetUnitId: targetService.unitId,
      complaint: options?.complaint,
      updatedBy: currentUserId,
      reason: `Tugaskan layanan medis ke ${targetService.name}`,
      previousStatus: apt.status,
    });

    // Invalidate Redis caches
    await Promise.allSettled([
      this.redisService.deleteByPrefix('queue:'),
      this.redisService.deleteByPrefix('appointments:'),
      this.redisService.invalidateTags(
        'queue',
        'daily',
        'display',
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'appointments',
        'appointments:me',
      ),
    ]);

    const updated = await this.findAppointmentById(appointmentId);
    if (!updated) throw new AppointmentNotFoundException(appointmentId);

    // Publish real-time event
    await this.notificationPublisher.publishAssignmentChanged(
      updated,
      {
        doctorName: updated.doctorName,
        roomName: updated.roomName,
        serviceName: targetService.name,
        type: 'service',
      },
      user,
    );

    if (this.realtimeEmitter) {
      await this.realtimeEmitter.emitStatusChanged({
        appointmentId: updated.id,
        status: updated.status,
        previousStatus: toDomainStatus(apt.status),
        queueNumber: Number(updated.queueNumber) || 1,
        practitionerId: updated.staffId || '',
        patientUserId: updated.patientUserId,
      });
    }

    return updated;
  }

  async bulkChangeDoctor(
    appointmentIds: string[],
    targetDoctorId: string,
    options?: ChangeDoctorOptions,
    user?: any,
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      total: appointmentIds.length,
      succeededCount: 0,
      failedCount: 0,
      succeededIds: [],
      errors: [],
    };

    // Deterministic FIFO ordering strictly by appointment creation time (who booked first)
    const metaRows = await this.repository.findAppointmentsOrderMetadata(appointmentIds);
    const sortedIds = [...appointmentIds].sort((a, b) => {
      const rowA = metaRows.find((r) => r.id === a);
      const rowB = metaRows.find((r) => r.id === b);
      const timeA = rowA?.createdAt ? new Date(rowA.createdAt).getTime() : 0;
      const timeB = rowB?.createdAt ? new Date(rowB.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    const affectedPartitions = new Map<
      string,
      { serviceDate: string; practitionerId: string }
    >();

    for (const id of sortedIds) {
      try {
        const updated = await this.changeDoctor(
          id,
          targetDoctorId,
          options,
          user,
        );
        result.succeededCount++;
        result.succeededIds.push(id);
        if (updated.appointmentDate) {
          const key = `${updated.appointmentDate}|${targetDoctorId}`;
          if (!affectedPartitions.has(key)) {
            affectedPartitions.set(key, {
              serviceDate: updated.appointmentDate,
              practitionerId: targetDoctorId,
            });
          }
        }
      } catch (err: any) {
        result.failedCount++;
        result.errors.push({
          id,
          message: err?.message || 'Gagal mengalihkan dokter',
        });
      }
    }

    if (this.queueRecalculationService && affectedPartitions.size > 0) {
      for (const partition of affectedPartitions.values()) {
        await this.queueRecalculationService
          .recalculateDoctorQueue(partition)
          .catch(() => {});
      }
    }

    return result;
  }

  async bulkChangeRoom(
    appointmentIds: string[],
    targetRoomId: string,
    user?: any,
  ): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
      total: appointmentIds.length,
      succeededCount: 0,
      failedCount: 0,
      succeededIds: [],
      errors: [],
    };

    // Deterministic FIFO ordering strictly by appointment creation time (who booked first)
    const metaRows = await this.repository.findAppointmentsOrderMetadata(appointmentIds);
    const sortedIds = [...appointmentIds].sort((a, b) => {
      const rowA = metaRows.find((r) => r.id === a);
      const rowB = metaRows.find((r) => r.id === b);
      const timeA = rowA?.createdAt ? new Date(rowA.createdAt).getTime() : 0;
      const timeB = rowB?.createdAt ? new Date(rowB.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    for (const id of sortedIds) {
      try {
        await this.changeRoom(id, targetRoomId, user);
        result.succeededCount++;
        result.succeededIds.push(id);
      } catch (err: any) {
        result.failedCount++;
        result.errors.push({
          id,
          message: err?.message || 'Gagal mengalihkan ruangan',
        });
      }
    }

    return result;
  }
}
