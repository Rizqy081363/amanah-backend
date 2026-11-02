import { z } from 'zod';

export const UpdateMedicalIntakeSchema = z.object({
  answers: z.record(z.string(), z.any()),
});
export type UpdateMedicalIntakeInput = z.infer<typeof UpdateMedicalIntakeSchema>;

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
  healthConditions: z.array(z.any()).optional(),
  anamnesisResponses: z.array(z.any()).optional(),
  diseaseHistory: z.record(z.string(), z.any()).optional(),
  answers: z.record(z.string(), z.any()).optional(),
});
export type UpdateMaternityIntakeInput = z.infer<
  typeof UpdateMaternityIntakeSchema
>;

export const UpdateChildImmunizationIntakeSchema = z.object({
  childName: z.string().optional(),
  childNik: z
    .string()
    .regex(/^\d{16}$/, { message: 'NIK anak harus berupa 16 digit angka' })
    .optional()
    .or(z.literal('')),
  childBirthDate: z.string().optional(),
  childSex: z.enum(['Laki-laki', 'Perempuan']).optional(),
  childAgeFormatted: z.string().optional(),
  parentPhone: z.string().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  childAddress: z.string().optional(),
  hasVaccineHistory: z.string().optional(),
  previousVaccineHistory: z.string().optional(),
  hasAllergyHistory: z.string().optional(),
  childAllergyHistory: z.string().optional(),
  entries: z.array(z.any()).optional(),
  answers: z.record(z.string(), z.any()).optional(),
});
export type UpdateChildImmunizationIntakeInput = z.infer<
  typeof UpdateChildImmunizationIntakeSchema
>;
