/**
 * Schedule Patient Eligibility Helper
 *
 * Single Source of Truth (SSOT) untuk eligibilitas pasien pada jadwal dokter:
 * Pasien hanya eligible masuk ke jadwal dokter/sesi jika memenuhi 2 kondisi final:
 * 1. Dokter telah di-assign (practitionerId === doctorId)
 * 2. Ruangan telah di-assign (roomId !== null)
 */

export interface CandidateAppointmentForEligibility {
  practitionerId?: string | null;
  roomId?: string | null;
  scheduledDate?: string | null;
  scheduledStartTime?: string | null;
}

export class SchedulePatientEligibilityHelper {
  /**
   * Syarat 1: Pasien telah di-assign ke praktisi/dokter tertentu
   */
  static isAssignedToDoctor(
    appointment: CandidateAppointmentForEligibility,
    doctorId: string,
  ): boolean {
    return Boolean(appointment.practitionerId && appointment.practitionerId === doctorId);
  }

  /**
   * Syarat 2: Pasien telah di-assign ke ruangan poliklinik tertentu
   */
  static isAssignedToRoom(
    appointment: CandidateAppointmentForEligibility,
  ): boolean {
    return Boolean(appointment.roomId);
  }

  /**
   * Evaluasi eligibilitas level dokter (2 kondisi final):
   * 1. Dokter ter-assign
   * 2. Ruangan ter-assign
   */
  static isEligibleForDoctorCard(
    appointment: CandidateAppointmentForEligibility,
    doctorId: string,
  ): boolean {
    return (
      this.isAssignedToDoctor(appointment, doctorId) &&
      this.isAssignedToRoom(appointment)
    );
  }

  /**
   * Evaluasi eligibilitas sesi praktik dokter (2 kondisi final + rentang waktu sesi):
   * 1. Dokter ter-assign
   * 2. Ruangan ter-assign
   * 3. Waktu janji temu berada dalam rentang sesi [sessStart, sessEnd)
   */
  static isEligibleForDoctorSession(
    appointment: CandidateAppointmentForEligibility,
    doctorId: string,
    sessStart: string,
    sessEnd: string,
  ): boolean {
    if (!this.isEligibleForDoctorCard(appointment, doctorId)) {
      return false;
    }

    if (!appointment.scheduledStartTime) {
      return false;
    }

    const aStart =
      appointment.scheduledStartTime.length === 5
        ? `${appointment.scheduledStartTime}:00`
        : appointment.scheduledStartTime;
    const startWindow = sessStart.length === 5 ? `${sessStart}:00` : sessStart;
    const endWindow = sessEnd.length === 5 ? `${sessEnd}:00` : sessEnd;

    return aStart >= startWindow && aStart < endWindow;
  }
}
