import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  childImmunizationIntakes,
  clinicServices,
  maternalHealthIntakes,
  patientAddresses,
  patientProfiles,
} from '../../../database/schema/amanah.schema';

export interface FormRequirementResponse {
  flow: 'immunization' | 'pregnancy' | 'general';
  serviceId: string;
  serviceName: string;
  isExistingPatient: boolean;
  patientId: string | null;
  patientName: string | null;
  reusableIdentity: Record<string, any>;
  prefilledValues: Record<string, any>;
  omittedFieldIds: string[];
}

@Injectable()
export class FormRequirementService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async resolveRequirement(
    serviceId: string,
    patientId?: string,
    user?: any,
  ): Promise<FormRequirementResponse> {
    const [service] = await this.db
      .select({
        id: clinicServices.id,
        name: clinicServices.name,
        code: clinicServices.code,
        medicalFlow: clinicServices.medicalFlow,
      })
      .from(clinicServices)
      .where(eq(clinicServices.id, serviceId))
      .limit(1);

    if (!service) {
      throw new NotFoundException({
        code: 'SERVICE_NOT_FOUND',
        message: 'Layanan medis tidak ditemukan',
      });
    }

    const flow =
      service.medicalFlow === 'pregnancy'
        ? 'pregnancy'
        : service.medicalFlow === 'immunization'
          ? 'immunization'
          : 'general';

    if (!patientId) {
      return {
        flow,
        serviceId: service.id,
        serviceName: service.name,
        isExistingPatient: false,
        patientId: null,
        patientName: null,
        reusableIdentity: {},
        prefilledValues: {},
        omittedFieldIds: [],
      };
    }

    const [patient] = await this.db
      .select()
      .from(patientProfiles)
      .where(eq(patientProfiles.id, patientId))
      .limit(1);

    if (!patient) {
      return {
        flow,
        serviceId: service.id,
        serviceName: service.name,
        isExistingPatient: false,
        patientId,
        patientName: null,
        reusableIdentity: {},
        prefilledValues: {},
        omittedFieldIds: [],
      };
    }

    const [primaryAddress] = await this.db
      .select()
      .from(patientAddresses)
      .where(eq(patientAddresses.patientId, patientId))
      .orderBy(
        desc(patientAddresses.isPrimary),
        desc(patientAddresses.createdAt),
      )
      .limit(1);

    const addressText =
      primaryAddress?.fullAddress || primaryAddress?.line1 || '';

    const normalizedGender =
      patient.gender === 'female' || (patient.gender as string) === 'Perempuan'
        ? 'Perempuan'
        : 'Laki-laki';

    const rawBlood = patient.bloodType as string | null | undefined;
    const normalizedBlood =
      rawBlood && rawBlood !== 'unknown'
        ? rawBlood === 'Belum Tahu'
          ? 'Belum Tahu'
          : rawBlood.toUpperCase()
        : 'Belum Tahu';

    const patientNik =
      patient.nationalIdEncrypted || patient.nationalIdHash || '';

    if (flow === 'immunization') {
      const [latestIntake] = await this.db
        .select()
        .from(childImmunizationIntakes)
        .where(eq(childImmunizationIntakes.patientId, patientId))
        .orderBy(desc(childImmunizationIntakes.createdAt))
        .limit(1);

      const reusableIdentity = {
        childName: patient.fullName,
        childNik: patientNik,
        childBirthDate: patient.birthDate,
        childSex: normalizedGender,
        motherName: patient.motherName || latestIntake?.motherName || '',
        bloodType: normalizedBlood,
      };

      const prefilledValues = {
        parentPhone:
          latestIntake?.parentPhone || patient.phone || user?.phone || '',
        motherName: patient.motherName || latestIntake?.motherName || '',
        fatherName: latestIntake?.fatherName || '',
        childAddress: latestIntake?.childAddress || addressText,
      };

      const omittedFieldIds = [
        'childName',
        'childNik',
        'childBirthDate',
        'childSex',
      ];

      return {
        flow,
        serviceId: service.id,
        serviceName: service.name,
        isExistingPatient: true,
        patientId: patient.id,
        patientName: patient.fullName,
        reusableIdentity,
        prefilledValues,
        omittedFieldIds,
      };
    }

    if (flow === 'pregnancy') {
      const [latestIntake] = await this.db
        .select()
        .from(maternalHealthIntakes)
        .where(eq(maternalHealthIntakes.patientId, patientId))
        .orderBy(desc(maternalHealthIntakes.createdAt))
        .limit(1);

      const reusableIdentity = {
        motherName: patient.fullName,
        motherNik: patientNik,
        motherBirthDate: patient.birthDate,
        motherBloodType: normalizedBlood,
      };

      const prefilledValues = {
        phoneNumber:
          latestIntake?.phoneNumber || patient.phone || user?.phone || '',
        domicileAddress: latestIntake?.domicileAddress || addressText,
        identityCardAddress: latestIntake?.identityCardAddress || addressText,
        partnerName: latestIntake?.partnerName || '',
        partnerNik: latestIntake?.partnerNik || '',
        partnerJob: latestIntake?.partnerJob || '',
        partnerBloodType: latestIntake?.partnerBloodType || 'Belum Tahu',
        motherJob: latestIntake?.motherJob || patient.occupation || '',
        motherEducation: latestIntake?.motherEducation || '',
        religion: latestIntake?.religion || '',
      };

      const omittedFieldIds = [
        'motherName',
        'motherNik',
        'motherBirthDate',
        'motherBloodType',
      ];

      return {
        flow,
        serviceId: service.id,
        serviceName: service.name,
        isExistingPatient: true,
        patientId: patient.id,
        patientName: patient.fullName,
        reusableIdentity,
        prefilledValues,
        omittedFieldIds,
      };
    }

    return {
      flow: 'general',
      serviceId: service.id,
      serviceName: service.name,
      isExistingPatient: true,
      patientId: patient.id,
      patientName: patient.fullName,
      reusableIdentity: {
        fullName: patient.fullName,
        nik: patientNik,
        birthDate: patient.birthDate,
        gender: normalizedGender,
        bloodType: normalizedBlood,
      },
      prefilledValues: {
        phone: patient.phone || user?.phone || '',
        email: patient.email || user?.email || '',
        address: addressText,
      },
      omittedFieldIds: ['fullName', 'nik', 'birthDate', 'gender', 'bloodType'],
    };
  }
}
