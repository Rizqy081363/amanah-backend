import { z } from 'zod';

export const UpdateMedicalIntakeSchema = z.object({
  answers: z.record(z.string(), z.any()),
});
export type UpdateMedicalIntakeInput = z.infer<typeof UpdateMedicalIntakeSchema>;

export const HealthConditionItemSchema = z.object({
  conditionCode: z.string().min(1, { message: 'Kode kondisi wajib diisi' }),
  hasCondition: z.boolean(),
  diagnosisYear: z.preprocess(
    (val) =>
      val === '' || val === null || val === undefined ? null : Number(val),
    z
      .number()
      .int({ message: 'Tahun terdiagnosis harus berupa bilangan bulat' })
      .min(1900, {
        message: 'Tahun terdiagnosis tidak boleh lebih awal dari 1900',
      })
      .max(new Date().getFullYear(), {
        message: 'Tahun terdiagnosis tidak boleh melebihi tahun saat ini',
      })
      .nullable()
      .optional(),
  ),
  notes: z.string().nullable().optional(),
});

export const UpdateMaternityIntakeSchema = z.object({
  motherName: z.string().optional(),
  motherNik: z
    .string()
    .regex(/^\d{16}$/, { message: 'NIK ibu harus berupa 16 digit angka' })
    .optional()
    .or(z.literal('')),
  motherBirthDate: z.string().optional(),
  motherAge: z.coerce.number().optional(),
  marriageOrder: z.coerce.number().optional(),
  marriageDate: z.string().optional(),
  motherJob: z.string().optional(),
  motherEducation: z.string().optional(),
  religion: z.string().optional(),
  phoneNumber: z.string().optional(),
  domicileAddress: z.string().optional(),
  identityCardAddress: z.string().optional(),
  dasawisma: z.string().optional(),
  posyandu: z.string().optional(),
  puskesmas: z.string().optional(),

  partnerName: z.string().optional(),
  partnerNik: z
    .string()
    .regex(/^\d{16}$/, { message: 'NIK suami harus berupa 16 digit angka' })
    .optional()
    .or(z.literal('')),
  partnerBirthDate: z.string().optional(),
  partnerAge: z.coerce.number().optional(),
  partnerJob: z.string().optional(),
  partnerEducation: z.string().optional(),
  partnerBloodType: z.string().optional(),
  partnerPhone: z.string().optional(),

  heightCm: z.coerce.number().optional(),
  prePregnancyWeightKg: z.coerce.number().optional(),
  upperArmCircumferenceCm: z.coerce.number().optional(),
  initialBmi: z.coerce.number().optional(),
  tetanusStatus: z.string().optional(),
  motherBloodType: z.string().optional(),

  hpht: z.string().optional(),
  estimatedDueDate: z.string().optional(),
  gestationalAgeWeeks: z.coerce.number().optional(),
  gestationalAgeFormatted: z.string().optional(),
  currentComplaints: z.string().optional(),

  gravidaCount: z.coerce.number().optional(),
  parityCount: z.coerce.number().optional(),
  abortionCount: z.coerce.number().optional(),
  livingChildrenCount: z.coerce.number().optional(),
  hasPreviousPregnancyHistory: z.boolean().optional(),
  hasContraceptionHistory: z.boolean().optional(),

  smokedBeforePregnancy: z.string().optional(),
  alcoholBeforePregnancy: z.boolean().optional(),
  irregularDietBeforePregnancy: z.boolean().optional(),
  reducedPhysicalActivityBeforePregnancy: z.boolean().optional(),
  unprescribedMedicationBeforePregnancy: z.boolean().optional(),
  concerningCosmeticUseBeforePregnancy: z.boolean().optional(),
  pesticideExposureBeforePregnancy: z.boolean().optional(),
  chemicalExposureBeforePregnancy: z.boolean().optional(),
  smokeExposureBeforePregnancy: z.boolean().optional(),

  concerningEnvironmentNotes: z.string().optional(),
  allergyInfo: z.string().optional(),
  otherNotes: z.string().optional(),

  husband: z.any().optional(),
  previousPregnancies: z.array(z.any()).optional(),
  contraceptiveHistories: z.array(z.any()).optional(),
  healthConditions: z.array(HealthConditionItemSchema).optional(),
});
export type UpdateMaternityIntakeInput = z.infer<
  typeof UpdateMaternityIntakeSchema
>;
