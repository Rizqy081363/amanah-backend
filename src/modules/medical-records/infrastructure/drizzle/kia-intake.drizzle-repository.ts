import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { desc, eq, or } from 'drizzle-orm';
import { NikSecurityService } from '../../../../common/security/nik';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  medicalIntakeSubmissions,
  patientProfiles,
} from '../../../../database/schema';
import { AppointmentsService } from '../../../appointments/application/appointments.service';
import { ImmunizationDrizzleRepository } from '../../../immunization/infrastructure/drizzle/immunization.drizzle-repository';
import { CreateMaternityIntakeUseCase } from '../../../maternity/application/use-cases/create-maternity-intake.use-case';
import { UpdateMaternityIntakeUseCase } from '../../../maternity/application/use-cases/update-maternity-intake.use-case';
import { MaternityDrizzleRepository } from '../../../maternity/infrastructure/drizzle/maternity.drizzle-repository';
import { CreateMaternityIntakeDto } from '../../../maternity/presentation/dto/create-maternity-intake.dto';
import { UpdateMaternityIntakeDto } from '../../../maternity/presentation/dto/update-maternity-intake.dto';
import { formatBloodTypeDisplay } from '../../../patients/domain/data/patient-reference.data';

@Injectable()
export class KiaIntakeDrizzleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly maternalRepo: MaternityDrizzleRepository,
    private readonly createMaternalUseCase: CreateMaternityIntakeUseCase,
    private readonly updateMaternalUseCase: UpdateMaternityIntakeUseCase,
    private readonly immunizationRepo: ImmunizationDrizzleRepository,
    private readonly nikSecurity: NikSecurityService,
    @Optional()
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointmentsService?: AppointmentsService,
  ) {}

  async createMaternalIntake(
    dto: CreateMaternityIntakeDto,
    submittedByUserId?: string,
  ): Promise<any> {
    return this.createMaternalUseCase.execute(dto, submittedByUserId);
  }

  async updateMaternalIntake(
    id: string,
    dto: UpdateMaternityIntakeDto,
  ): Promise<any> {
    return this.updateMaternalUseCase.execute(id, dto);
  }

  async findMaternalIntakeById(id: string): Promise<any | null> {
    return this.maternalRepo.findById(id);
  }

  async findMaternalIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    return this.maternalRepo.findByAppointmentId(appointmentId);
  }

  async findMaternalHistory(patientIds: string[], query: any): Promise<any> {
    return this.maternalRepo.findMaternalHistory(patientIds, query);
  }

  async createImmunizationIntake(
    dto: any,
    submittedByUserId?: string,
  ): Promise<any> {
    return this.immunizationRepo.createIntake(dto, submittedByUserId);
  }

  async updateImmunizationIntake(id: string, dto: any): Promise<any> {
    return this.immunizationRepo.updateIntake(id, dto);
  }

  async updateIntakeSubmission(
    id: string,
    answers: Record<string, any>,
  ): Promise<any> {
    const existing = await this.db.query.medicalIntakeSubmissions.findFirst({
      where: or(
        eq(medicalIntakeSubmissions.id, id),
        eq(medicalIntakeSubmissions.appointmentId, id),
      ),
    });

    if (existing) {
      if (existing.appointmentId) {
        const app = await this.db.query.appointments.findFirst({
          where: eq(appointments.id, existing.appointmentId),
        });
        if (app?.status === 'completed') {
          throw new ForbiddenException(
            'Rekam medis pada janji temu yang telah selesai bersifat terkunci dan tidak dapat diubah.',
          );
        }
        if ('complaint' in answers) {
          const nextComplaint =
            typeof answers.complaint === 'string' &&
            answers.complaint.trim().length > 0
              ? answers.complaint.trim()
              : null;
          await this.db
            .update(appointments)
            .set({
              complaint: nextComplaint,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(appointments.id, existing.appointmentId));
        }
      }
      const merged = {
        ...(existing.answers as Record<string, any>),
        ...answers,
      };
      const [updated] = await this.db
        .update(medicalIntakeSubmissions)
        .set({ answers: merged, updatedAt: new Date().toISOString() })
        .where(eq(medicalIntakeSubmissions.id, existing.id))
        .returning();
      return updated;
    }

    const app = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, id),
    });
    if (app) {
      if (app.status === 'completed') {
        throw new ForbiddenException(
          'Rekam medis pada janji temu yang telah selesai bersifat terkunci dan tidak dapat diubah.',
        );
      }
      if ('complaint' in answers) {
        const nextComplaint =
          typeof answers.complaint === 'string' &&
          answers.complaint.trim().length > 0
            ? answers.complaint.trim()
            : null;
        await this.db
          .update(appointments)
          .set({
            complaint: nextComplaint,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(appointments.id, id));
      }
      return {
        id,
        appointmentId: id,
        flow: app.medicalFlow || 'regular',
        answers,
        success: true,
      };
    }

    return null;
  }

  async findImmunizationIntakeById(id: string): Promise<any | null> {
    return this.immunizationRepo.findIntakeById(id);
  }

  async findImmunizationIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    return this.immunizationRepo.findIntakeByAppointmentId(appointmentId);
  }

  private mapPatientProfile(profile: any, apptMetadata?: any) {
    if (!profile) return null;
    const addr = profile.patientAddresses?.[0];
    const aff = profile.patientAffiliations?.[0];
    const ec = profile.patientEmergencyContacts?.[0];

    const accountHolderName =
      apptMetadata?.parentUserName ||
      aff?.user?.name ||
      profile.user?.name ||
      null;

    const rawRelType =
      apptMetadata?.affiliationRelationship ||
      aff?.relationshipType?.code ||
      aff?.relationshipType ||
      '';
    const relType =
      typeof rawRelType === 'string' ? rawRelType.toLowerCase() : '';

    const isPrimaryAccount = Boolean(
      profile.user?.id || aff?.isPrimary || aff?.relationshipType?.isSystem,
    );

    let relationshipContext: string | null = null;
    if (isPrimaryAccount) {
      relationshipContext = 'Akun Utama (Diri Sendiri)';
    } else {
      const relationshipName =
        aff?.relationLabel ||
        aff?.relationshipType?.name ||
        apptMetadata?.affiliationRelationship ||
        'Keluarga';

      if (accountHolderName) {
        relationshipContext = `${relationshipName} dari ${accountHolderName}`;
      } else {
        relationshipContext = relationshipName;
      }
    }

    const decryptedNik = profile.nationalIdEncrypted
      ? this.nikSecurity.decrypt(profile.nationalIdEncrypted) || ''
      : '';
    const maskedNik = decryptedNik || null;

    return {
      id: profile.id,
      medicalRecordNumber: profile.medicalRecordNumber,
      nik: decryptedNik || '',
      maskedNik,
      fullName: profile.fullName,
      motherName: profile.motherName,
      birthPlace: profile.birthPlace,
      birthDate: profile.birthDate,
      gender: profile.gender,
      bloodType: formatBloodTypeDisplay(profile.bloodType),
      occupation: profile.occupation,
      phone: profile.phone,
      email: profile.email || aff?.user?.email || profile.user?.email || null,
      address: addr?.fullAddress || addr?.line1 || null,
      line1: addr?.line1 || null,
      villageName: addr?.villageName || null,
      villageCode: addr?.villageCode || null,
      districtName: addr?.districtName || null,
      districtCode: addr?.districtCode || null,
      regencyName: addr?.regencyName || null,
      regencyCode: addr?.regencyCode || null,
      provinceName: addr?.provinceName || null,
      provinceCode: addr?.provinceCode || null,
      relationshipType: relType || null,
      relationLabel: aff?.relationLabel || null,
      accountHolderName,
      relationshipContext,
      emergencyContactName: ec?.name || null,
      emergencyContactPhone: ec?.phone || null,
      emergencyContactRelationship: ec?.relationship || null,
    };
  }

  async findUnifiedIntakeByAppointmentId(
    appointmentId: string,
  ): Promise<any | null> {
    if (!isUUID(appointmentId)) return null;

    let fullAppt: any = null;
    if (this.appointmentsService) {
      try {
        fullAppt = await this.appointmentsService.findById(appointmentId);
      } catch {
        fullAppt = null;
      }
    }

    const appt = await this.db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      with: {
        clinicService: true,
        clinicRoom: true,
      },
    });

    if (!appt) {
      return null;
    }

    const patientProfileData = appt.patientId
      ? await this.db.query.patientProfiles.findFirst({
          where: eq(patientProfiles.id, appt.patientId),
          with: {
            patientAddresses: true,
            patientAffiliations: {
              with: {
                user: true,
                relationshipType: true,
              },
            },
            patientAllergies: true,
            patientEmergencyContacts: true,
            user: true,
          },
        })
      : null;

    const patientData = patientProfileData
      ? this.mapPatientProfile(patientProfileData, fullAppt)
      : null;

    const baseAppointmentData = {
      ...(fullAppt || {}),
      appointmentId: appt?.id || appointmentId,
      bookingCode: fullAppt?.bookingCode || appt?.bookingCode || null,
      queueNumber: fullAppt?.queueNumber || appt?.queueNumber || '-',
      scheduledDate: fullAppt?.appointmentDate || appt?.scheduledDate || null,
      appointmentDateFormatted:
        fullAppt?.appointmentDateFormatted ||
        fullAppt?.appointmentDate ||
        appt?.scheduledDate ||
        null,
      scheduledStartTime:
        fullAppt?.scheduledStartTime || appt?.scheduledStartTime || null,
      scheduledEndTime:
        fullAppt?.scheduledEndTime || appt?.scheduledEndTime || null,
      etaRange: fullAppt?.etaRange || null,
      session: fullAppt?.session || null,
      sessionName: fullAppt?.sessionName || null,
      doctorName:
        fullAppt?.doctorName ||
        (appt as any)?.practitioner?.staffProfile?.fullName ||
        null,
      doctorSpecialty:
        fullAppt?.doctorSpecialty ||
        (appt as any)?.practitioner?.medicalSpecialty?.name ||
        null,
      roomName: fullAppt?.roomName || appt?.clinicRoom?.name || null,
      poliklinikId: fullAppt?.poliklinikId || null,
      poliklinikName: fullAppt?.poliklinikName || null,
      layananId:
        fullAppt?.layananId ||
        appt?.serviceId ||
        appt?.clinicService?.id ||
        null,
      layananName: fullAppt?.layananName || appt?.clinicService?.name || null,
      serviceName: fullAppt?.layananName || appt?.clinicService?.name || null,
      actualStartedAt:
        fullAppt?.actualStartedAt || appt?.actualStartedAt || null,
      actualCompletedAt:
        fullAppt?.actualCompletedAt || appt?.actualCompletedAt || null,
      consultationDurationFormatted:
        fullAppt?.consultationDurationFormatted || null,
      consultationElapsedSeconds: fullAppt?.consultationElapsedSeconds || null,
      status: fullAppt?.status || appt?.status || 'BOOKED',
      rawStatus: fullAppt?.rawStatus || appt?.status || 'booked',
      complaint: fullAppt?.complaint || appt?.complaint || null,
      patient: patientData,
    };

    const maternal =
      await this.findMaternalIntakeByAppointmentId(appointmentId);
    if (maternal) {
      return {
        flow: 'pregnancy',
        type: 'maternal',
        data: {
          ...baseAppointmentData,
          ...maternal,
          appointmentId,
          patient: patientData,
        },
      };
    }

    const immunization =
      await this.findImmunizationIntakeByAppointmentId(appointmentId);
    if (immunization) {
      return {
        flow: 'immunization',
        type: 'immunization',
        data: {
          ...baseAppointmentData,
          ...immunization,
          appointmentId,
          patient: patientData,
        },
      };
    }

    if (appt) {
      return {
        flow: appt.medicalFlow || 'regular',
        type: 'regular',
        data: {
          ...baseAppointmentData,
          patient: patientData,
        },
      };
    }

    return null;
  }

  async findLatestImmunizationByPatientId(
    patientId: string,
  ): Promise<any | null> {
    const history = await this.immunizationRepo.findHistory({
      patientId,
      limit: 1,
    });
    if (!history.data || history.data.length === 0) return null;
    return this.immunizationRepo.findIntakeById(history.data[0].id);
  }

  async findLatestIntakeByPatientId(
    patientId: string,
    flow?: string,
  ): Promise<any | null> {
    if (!isUUID(patientId)) return null;

    if (flow === 'pregnancy' || flow === 'maternal' || !flow) {
      const maternal = await this.maternalRepo.findLatestByPatientId(patientId);
      if (maternal) {
        return { flow: 'pregnancy', type: 'maternal', data: maternal };
      }
    }

    if (flow === 'immunization' || !flow) {
      const immunization =
        await this.findLatestImmunizationByPatientId(patientId);
      if (immunization) {
        return {
          flow: 'immunization',
          type: 'immunization',
          data: immunization,
        };
      }
    }

    return null;
  }

  async findImmunizationHistory(
    patientIds: string[],
    query: {
      page?: number;
      limit?: number;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const patientId =
      patientIds && patientIds.length === 1 ? patientIds[0] : undefined;
    return this.immunizationRepo.findHistory({
      patientId,
      page: query.page,
      limit: query.limit,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }
}
