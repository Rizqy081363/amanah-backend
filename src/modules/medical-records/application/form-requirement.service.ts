import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  bloodTypes,
  childImmunizationIntakes,
  clinicServices,
  maternalHealthIntakes,
  patientAddresses,
  patientAffiliations,
  patientProfiles,
} from '../../../database/schema/amanah.schema';
import { formatBloodTypeDisplay } from '../../patients/domain/data/patient-reference.data';
import { NikSecurityService } from '../../../common/security/nik';
import { ROLE_AUDIENCE } from '../../../common/constants/role-audience.constants';
import type { AuthenticatedUser } from '../../../common/auth';

export interface FormRequirementResponse {
  flow: string | null;
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
    private readonly nikSecurity: NikSecurityService,
  ) {}

  async resolveRequirement(
    serviceId: string,
    patientId?: string,
    user?: AuthenticatedUser,
  ): Promise<FormRequirementResponse> {
    const service = await this.db.query.clinicServices.findFirst({
      where: eq(clinicServices.id, serviceId),
      with: {
        intakeForm: true,
      },
    });

    if (!service) {
      throw new NotFoundException({
        code: 'SERVICE_NOT_FOUND',
        message: 'Layanan medis tidak ditemukan',
      });
    }

    const flow = service.intakeForm?.code || null;

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
      .select({
        id: patientProfiles.id,
        userId: patientProfiles.userId,
        fullName: patientProfiles.fullName,
        gender: patientProfiles.gender,
        birthDate: patientProfiles.birthDate,
        nationalIdEncrypted: patientProfiles.nationalIdEncrypted,
        nationalIdHash: patientProfiles.nationalIdHash,
        motherName: patientProfiles.motherName,
        phone: patientProfiles.phone,
        email: patientProfiles.email,
        occupation: patientProfiles.occupation,
        bloodTypeName: bloodTypes.name,
      })
      .from(patientProfiles)
      .leftJoin(bloodTypes, eq(patientProfiles.bloodTypeId, bloodTypes.id))
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

    // Object-level authorization check: regular external patient cannot look up arbitrary other patient records
    if (user && user.audience === ROLE_AUDIENCE.EXTERNAL) {
      const isOwner = patient.userId === user.id;
      if (!isOwner) {
        const [affiliation] = await this.db
          .select({ id: patientAffiliations.id })
          .from(patientAffiliations)
          .where(
            and(
              eq(patientAffiliations.userId, user.id),
              eq(patientAffiliations.patientId, patientId),
            ),
          )
          .limit(1);

        if (!affiliation) {
          throw new ForbiddenException({
            code: 'FORBIDDEN_PATIENT_ACCESS',
            message: 'Akses ke data profil pasien ini tidak diizinkan',
          });
        }
      }
    }

    const addresses = await this.db
      .select({
        type: patientAddresses.type,
        fullAddress: patientAddresses.fullAddress,
        line1: patientAddresses.line1,
      })
      .from(patientAddresses)
      .where(eq(patientAddresses.patientId, patientId));

    const domicileAddress = addresses.find((a) => a.type === 'domicile');
    const identityCardAddress = addresses.find((a) => a.type === 'identity_card');

    const domicileText =
      domicileAddress?.fullAddress || domicileAddress?.line1 || '';
    const identityCardText =
      identityCardAddress?.fullAddress || identityCardAddress?.line1 || '';

    const normalizedGender = patient.gender || null;
    const normalizedBlood = patient.bloodTypeName || null;

    const patientNik = patient.nationalIdEncrypted
      ? this.nikSecurity.decrypt(patient.nationalIdEncrypted) || ''
      : patient.nationalIdHash && !patient.nationalIdHash.includes(':')
        ? patient.nationalIdHash
        : '';

    const reusableIdentity: Record<string, any> = {
      fullName: patient.fullName,
      nik: patientNik,
      birthDate: patient.birthDate,
      gender: normalizedGender,
      bloodType: normalizedBlood,
      domicileAddress: domicileText,
      identityCardAddress: identityCardText,
    };

    if (flow === 'pregnancy' || flow === 'maternity') {
      reusableIdentity.motherName = patient.fullName;
      reusableIdentity.motherNik = patientNik;
      reusableIdentity.motherBirthDate = patient.birthDate;
      reusableIdentity.motherBloodType = normalizedBlood;
    } else if (flow === 'immunization') {
      reusableIdentity.childName = patient.fullName;
      reusableIdentity.childNik = patientNik;
      reusableIdentity.childBirthDate = patient.birthDate;
      reusableIdentity.childSex = normalizedGender;
      if (patient.motherName) {
        reusableIdentity.motherName = patient.motherName;
      }
    }

    const prefilledValues: Record<string, any> = {
      phone: patient.phone || user?.phone || '',
      email: patient.email || user?.email || '',
      address: domicileText || identityCardText,
      phoneNumber: patient.phone || user?.phone || '',
      parentPhone: patient.phone || user?.phone || '',
      domicileAddress: domicileText,
      identityCardAddress: identityCardText,
      childAddress: domicileText || identityCardText,
      motherJob: patient.occupation || '',
    };

    const omittedFieldIds: string[] = [];

    // Enrich with any previous clinical intake records for this patient
    const [latestMaternal] = await this.db
      .select()
      .from(maternalHealthIntakes)
      .where(eq(maternalHealthIntakes.patientId, patientId))
      .orderBy(desc(maternalHealthIntakes.createdAt))
      .limit(1);

    if (latestMaternal) {
      if (latestMaternal.partnerName) prefilledValues.partnerName = latestMaternal.partnerName;
      if (latestMaternal.partnerNik) prefilledValues.partnerNik = latestMaternal.partnerNik;
      if (latestMaternal.partnerJob) prefilledValues.partnerJob = latestMaternal.partnerJob;
      if (latestMaternal.partnerBloodType) prefilledValues.partnerBloodType = latestMaternal.partnerBloodType;
      if (latestMaternal.motherEducation) prefilledValues.motherEducation = latestMaternal.motherEducation;
      if (latestMaternal.religion) prefilledValues.religion = latestMaternal.religion;
    }

    const [latestImmunization] = await this.db
      .select()
      .from(childImmunizationIntakes)
      .where(eq(childImmunizationIntakes.patientId, patientId))
      .orderBy(desc(childImmunizationIntakes.createdAt))
      .limit(1);

    if (latestImmunization) {
      if (latestImmunization.fatherName) prefilledValues.fatherName = latestImmunization.fatherName;
      if (latestImmunization.motherName && !reusableIdentity.motherName) {
        reusableIdentity.motherName = latestImmunization.motherName;
      }
    }

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
}
