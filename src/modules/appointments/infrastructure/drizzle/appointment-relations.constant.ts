export const APPOINTMENT_RELATIONS = {
  queueTickets: {
    with: {
      sessionDef: true,
    },
  },
  patientProfile: {
    with: {
      user: true,
      patientAffiliations: { with: { user: true } },
    },
  },
  clinicService: true,
  clinicRoom: { with: { clinicUnit: true } },
  practitioner: {
    with: {
      clinicRoom: { with: { clinicUnit: true } },
      staffProfile: { with: { user: true, clinicUnit: true } },
      medicalSpecialty: true,
    },
  },
} as const;
