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

export function refineObstetricCounts(
  data: {
    gravidaCount?: number | null;
    parityCount?: number | null;
    abortionCount?: number | null;
    livingChildrenCount?: number | null;
    hasPreviousPregnancyHistory?: boolean | null;
  },
  ctx: z.RefinementCtx,
) {
  const G =
    data.gravidaCount !== undefined && data.gravidaCount !== null
      ? Number(data.gravidaCount)
      : undefined;
  const P =
    data.parityCount !== undefined && data.parityCount !== null
      ? Number(data.parityCount)
      : undefined;
  const Ab =
    data.abortionCount !== undefined && data.abortionCount !== null
      ? Number(data.abortionCount)
      : undefined;
  const Ah =
    data.livingChildrenCount !== undefined && data.livingChildrenCount !== null
      ? Number(data.livingChildrenCount)
      : undefined;

  // 1. Gravida harus >= 1 untuk kehamilan saat ini
  if (G !== undefined && G < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Total kehamilan (Gravida) minimal bernilai 1 karena sedang hamil saat ini',
      path: ['gravidaCount'],
    });
  }

  // 2. Batas persalinan dan keguguran terhadap riwayat kehamilan sebelumnya (G - 1)
  if (G !== undefined && G >= 1) {
    const priorPregnancies = G - 1;

    if (P !== undefined && P > priorPregnancies) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Jumlah pernah melahirkan (${P}) tidak boleh melebihi riwayat kehamilan sebelumnya (${priorPregnancies})`,
        path: ['parityCount'],
      });
    }

    if (Ab !== undefined && Ab > priorPregnancies) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Jumlah pernah keguguran (${Ab}) tidak boleh melebihi riwayat kehamilan sebelumnya (${priorPregnancies})`,
        path: ['abortionCount'],
      });
    }

    if (P !== undefined && Ab !== undefined && P + Ab > priorPregnancies) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Total persalinan dan keguguran (${P + Ab}) melebihi riwayat kehamilan sebelumnya (${priorPregnancies})`,
        path: ['abortionCount'],
      });
    }

    if (data.hasPreviousPregnancyHistory === true && priorPregnancies === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Tidak dapat memiliki riwayat kehamilan sebelumnya pada kehamilan pertama (G1)',
        path: ['hasPreviousPregnancyHistory'],
      });
    }
  }

  // 3. Batas anak hidup terhadap jumlah pernah melahirkan
  if (P !== undefined) {
    if (P === 0 && Ah !== undefined && Ah > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Jumlah anak yang masih hidup harus 0 karena belum pernah melahirkan',
        path: ['livingChildrenCount'],
      });
    } else if (Ah !== undefined && Ah > P) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Jumlah anak yang masih hidup (${Ah}) tidak boleh melebihi jumlah pernah melahirkan (${P})`,
        path: ['livingChildrenCount'],
      });
    }
  }
}

export function refineMarriageDate(
  data: {
    marriageDate?: string | null;
    motherBirthDate?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (!data.marriageDate || data.marriageDate.trim() === '') return;
  const mDate = new Date(data.marriageDate);
  if (isNaN(mDate.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Format tanggal menikah tidak valid',
      path: ['marriageDate'],
    });
    return;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (mDate > today) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tanggal menikah tidak boleh di masa depan',
      path: ['marriageDate'],
    });
    return;
  }

  if (data.motherBirthDate && data.motherBirthDate.trim() !== '') {
    const bDate = new Date(data.motherBirthDate);
    if (!isNaN(bDate.getTime())) {
      if (mDate <= bDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Tanggal menikah tidak boleh lebih awal dari tanggal lahir pasien',
          path: ['marriageDate'],
        });
        return;
      }

      const minMarriage = new Date(bDate);
      minMarriage.setFullYear(minMarriage.getFullYear() + 12);
      if (mDate < minMarriage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Usia saat menikah minimal 12 tahun setelah kelahiran',
          path: ['marriageDate'],
        });
      }
    }
  }
}

export function refineHphtDate(
  data: {
    hpht?: string | null;
    motherBirthDate?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (!data.hpht || data.hpht.trim() === '') return;
  const hDate = new Date(data.hpht);
  if (isNaN(hDate.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Format tanggal HPHT tidak valid',
      path: ['hpht'],
    });
    return;
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (hDate > today) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tanggal HPHT tidak boleh di masa depan',
      path: ['hpht'],
    });
    return;
  }

  if (data.motherBirthDate && data.motherBirthDate.trim() !== '') {
    const bDate = new Date(data.motherBirthDate);
    if (!isNaN(bDate.getTime())) {
      if (hDate <= bDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Tanggal HPHT tidak boleh lebih awal dari tanggal lahir pasien',
          path: ['hpht'],
        });
        return;
      }
    }
  }
}

export const CreateMaternityIntakeSchema = z
  .object({
    patientId: z.string().uuid({ message: 'ID pasien harus berupa UUID valid' }),
    appointmentId: z
      .string()
      .uuid({ message: 'ID appointment harus berupa UUID valid' })
      .optional()
      .nullable(),
    motherName: z.string().min(1, { message: 'Nama lengkap ibu wajib diisi' }),
    motherNik: z
      .string()
      .regex(/^\d{16}$/, { message: 'NIK ibu harus berupa 16 digit angka' })
      .optional()
      .or(z.literal(''))
      .nullable(),
    motherBirthDate: z.string().optional().nullable(),
    motherAge: z.coerce.number().optional().nullable(),
    marriageOrder: z.coerce.number().optional().nullable(),
    marriageDate: z.string().optional().nullable(),
    motherJob: z.string().optional().nullable(),
    motherEducation: z.string().optional().nullable(),
    religion: z.string().optional().nullable(),
    phoneNumber: z.string().optional().nullable(),
    domicileAddress: z.string().optional().nullable(),
    identityCardAddress: z.string().optional().nullable(),
    dasawisma: z.string().optional().nullable(),
    posyandu: z.string().optional().nullable(),
    puskesmas: z.string().optional().nullable(),

    partnerName: z.string().optional().nullable(),
    partnerNik: z
      .string()
      .regex(/^\d{16}$/, { message: 'NIK suami harus berupa 16 digit angka' })
      .optional()
      .or(z.literal(''))
      .nullable(),
    partnerBirthDate: z.string().optional().nullable(),
    partnerAge: z.coerce.number().optional().nullable(),
    partnerJob: z.string().optional().nullable(),
    partnerEducation: z.string().optional().nullable(),
    partnerBloodType: z.string().optional().nullable(),
    partnerPhone: z.string().optional().nullable(),

    heightCm: z.coerce.number().optional().nullable(),
    prePregnancyWeightKg: z.coerce.number().optional().nullable(),
    upperArmCircumferenceCm: z.coerce.number().optional().nullable(),
    initialBmi: z.coerce.number().optional().nullable(),
    tetanusStatus: z.string().optional().nullable(),
    motherBloodType: z.string().optional().nullable(),

    hpht: z.string().optional().nullable(),
    estimatedDueDate: z.string().optional().nullable(),
    gestationalAgeWeeks: z.coerce.number().optional().nullable(),
    gestationalAgeFormatted: z.string().optional().nullable(),
    currentComplaints: z
      .string()
      .min(1, { message: 'Keluhan saat ini wajib diisi' }),

    gravidaCount: z.coerce.number().int().min(1, {
      message: 'Total kehamilan (Gravida) minimal bernilai 1',
    }),
    parityCount: z.coerce.number().int().min(0, {
      message: 'Jumlah pernah melahirkan minimal bernilai 0',
    }),
    abortionCount: z.coerce.number().int().min(0, {
      message: 'Jumlah pernah keguguran minimal bernilai 0',
    }),
    livingChildrenCount: z.coerce.number().int().min(0, {
      message: 'Jumlah anak hidup minimal bernilai 0',
    }),
    hasPreviousPregnancyHistory: z.boolean().optional().nullable(),
    hasContraceptionHistory: z.boolean().optional().nullable(),

    smokedBeforePregnancy: z.string().optional().nullable(),
    alcoholBeforePregnancy: z.boolean().optional().nullable(),
    irregularDietBeforePregnancy: z.boolean().optional().nullable(),
    reducedPhysicalActivityBeforePregnancy: z.boolean().optional().nullable(),
    unprescribedMedicationBeforePregnancy: z.boolean().optional().nullable(),
    concerningCosmeticUseBeforePregnancy: z.boolean().optional().nullable(),
    pesticideExposureBeforePregnancy: z.boolean().optional().nullable(),
    chemicalExposureBeforePregnancy: z.boolean().optional().nullable(),
    smokeExposureBeforePregnancy: z.boolean().optional().nullable(),

    concerningEnvironmentNotes: z.string().optional().nullable(),
    allergyInfo: z.string().optional().nullable(),
    otherNotes: z.string().optional().nullable(),

    husband: z.any().optional().nullable(),
    previousPregnancies: z.array(z.any()).optional().nullable(),
    contraceptiveHistories: z.array(z.any()).optional().nullable(),
    healthConditions: z.array(HealthConditionItemSchema).optional().nullable(),
  })
  .superRefine(refineObstetricCounts)
  .superRefine(refineMarriageDate)
  .superRefine(refineHphtDate);

export type CreateMaternityIntakeInput = z.infer<
  typeof CreateMaternityIntakeSchema
>;

export const UpdateMaternityIntakeSchema = z
  .object({
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
  })
  .superRefine(refineObstetricCounts)
  .superRefine(refineMarriageDate)
  .superRefine(refineHphtDate);

export type UpdateMaternityIntakeInput = z.infer<
  typeof UpdateMaternityIntakeSchema
>;
