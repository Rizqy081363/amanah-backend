import { beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PatientAffiliationsController } from './patient-affiliations.controller';

describe('PatientAffiliationsController', () => {
  let controller: PatientAffiliationsController;
  let affiliationRepo: any;
  let patientRepo: any;
  let db: any;

  beforeEach(() => {
    affiliationRepo = {
      findByUserId: mock(),
      findByUserAndPatient: mock(),
      create: mock(),
      delete: mock(),
    };

    patientRepo = {
      findByNik: mock(),
      create: mock(),
    };

    db = {
      select: mock().mockReturnThis(),
      from: mock().mockReturnThis(),
      where: mock().mockReturnThis(),
      orderBy: mock().mockReturnThis(),
      limit: mock().mockResolvedValue([{ mrn: 'RM-202609-0005' }]),
      insert: mock().mockReturnValue({
        values: mock().mockReturnValue({
          returning: mock().mockResolvedValue([{ id: 'new-pat-123' }]),
        }),
      }),
    };

    controller = new PatientAffiliationsController(
      affiliationRepo,
      patientRepo,
      db,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyAffiliations', () => {
    it('should return user affiliations list', async () => {
      const mockList = [
        {
          id: 'aff-1',
          userId: 'user-1',
          patientId: 'pat-1',
          relationshipType: 'self',
          relationLabel: 'Diri Sendiri',
          isPrimary: true,
        },
      ];
      affiliationRepo.findByUserId.mockResolvedValue(mockList);

      const res = await controller.getMyAffiliations({ id: 'user-1' });
      expect(res.success).toBe(true);
      expect(res.data).toEqual(mockList as any);
      expect(affiliationRepo.findByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createAffiliation', () => {
    it('should link existing patient if patient_id is provided', async () => {
      const dto = {
        patient_id: 'pat-existing',
        relationship_type: 'child' as const,
        relation_label: 'Anak',
      };
      affiliationRepo.create.mockResolvedValue({
        id: 'aff-2',
        userId: 'user-1',
        patientId: 'pat-existing',
        relationshipType: 'child',
      });

      const res = await controller.createAffiliation(
        { id: 'user-1' },
        dto as any,
      );
      expect(res.success).toBe(true);
      expect(affiliationRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        patientId: 'pat-existing',
        relationshipType: 'child',
        relationLabel: 'Anak',
        isPrimary: false,
      });
    });

    it('should throw BadRequestException if patient_id is not provided and demographic fields are missing', async () => {
      const dto = {
        relationship_type: 'child' as const,
      };

      expect(
        controller.createAffiliation({ id: 'user-1' }, dto as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should create new patient profile if patient_id is not provided and NIK is new', async () => {
      const dto = {
        name: 'Budi Kecil',
        nik: '3201234567890099',
        birth_date: '2020-01-01',
        gender: 'Laki-laki' as const,
        relationship_type: 'child' as const,
        relation_label: 'Anak',
      };

      patientRepo.findByNik.mockResolvedValue(null);
      affiliationRepo.create.mockResolvedValue({
        id: 'aff-3',
        userId: 'user-1',
        patientId: 'new-pat-123',
        relationshipType: 'child',
      });

      const res = await controller.createAffiliation(
        { id: 'user-1' },
        dto as any,
      );
      expect(res.success).toBe(true);
      expect(affiliationRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        patientId: 'new-pat-123',
        relationshipType: 'child',
        relationLabel: 'Anak',
        isPrimary: false,
      });
    });
  });

  describe('deleteAffiliation', () => {
    it('should throw NotFoundException if affiliation does not exist', async () => {
      affiliationRepo.findByUserAndPatient.mockResolvedValue(null);

      expect(
        controller.deleteAffiliation({ id: 'user-1' }, 'pat-999'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw ConflictException when trying to delete primary affiliation', async () => {
      affiliationRepo.findByUserAndPatient.mockResolvedValue({
        id: 'aff-1',
        isPrimary: true,
      });

      expect(
        controller.deleteAffiliation({ id: 'user-1' }, 'pat-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should delete non-primary affiliation successfully', async () => {
      affiliationRepo.findByUserAndPatient.mockResolvedValue({
        id: 'aff-2',
        isPrimary: false,
      });
      affiliationRepo.delete.mockResolvedValue(true);

      const res = await controller.deleteAffiliation({ id: 'user-1' }, 'pat-2');
      expect(res.success).toBe(true);
      expect(affiliationRepo.delete).toHaveBeenCalledWith('user-1', 'pat-2');
    });
  });
});
