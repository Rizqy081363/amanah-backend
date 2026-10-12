export const APPOINTMENT_RELATIONS = {
  queueTickets: true,
  patientProfile: { with: { patientAffiliations: { with: { user: true } } } },
  clinicService: true,
  clinicRoom: { with: { clinicUnit: true } },
  practitioner: {
    with: {
      clinicRoom: { with: { clinicUnit: true } },
      staffProfile: { with: { clinicUnit: true } },
      medicalSpecialty: true,
    },
  },
} as const;
